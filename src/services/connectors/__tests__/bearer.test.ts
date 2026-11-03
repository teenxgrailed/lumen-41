import { NextRequest, NextResponse } from "next/server";

import {
  CONNECT_WRITE_LIMIT_PER_MINUTE,
  authenticateConnectorRequest,
  scopeForRole,
} from "@/services/connectors/auth";
import { hashConnectorToken } from "@/services/connectors/auth-tokens";
import {
  PERSONAL_TOKEN_SCOPES,
  authenticateBearer,
  registerBearerResolver,
} from "@/services/connectors/bearer";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn(), update: jest.fn() },
    personalApiToken: { findUnique: jest.fn(), update: jest.fn() },
    // An unknown OAuth access token: the built-in resolver finds nothing.
    oAuthToken: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  ...jest.requireActual("@/lib/auth/workspace-auth"),
  resolveWorkspaceAccess: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((_value, namespace, limit) => ({ namespace, limit })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));

const findUnique = prisma.connectorSettings.findUnique as jest.Mock;
const legacyUpdate = prisma.connectorSettings.update as jest.Mock;
const namedFind = prisma.personalApiToken.findUnique as jest.Mock;
const namedUpdate = prisma.personalApiToken.update as jest.Mock;
const NAMED = "needt_named-chrome-token-value";
const REVOKED = "needt_revoked-named-token-value";
const NAMED_ROW = {
  id: "tok-chrome",
  userId: "user-1",
  name: "Chrome",
  expiresAt: null as Date | null,
  revokedAt: null as Date | null,
  lastUsedAt: null as Date | null,
};
const PERSONAL = "needt_personal-connector-token-value";
const OAUTH = "ext_other-kind-token-value";
const WRITER = "ext_writer-without-mail-token";

function request(authorization?: string, query = "") {
  return new NextRequest(`http://localhost/api/connect/tasks${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

registerBearerResolver(async (token) =>
  token === OAUTH
    ? {
        userId: "user-2",
        kind: "oauth",
        clientId: "client-1",
        scopes: ["needt.read"],
        workspaceId: "workspace-bound",
      }
    : null
);
// Consented to read and write, not to mail.
registerBearerResolver(async (token) =>
  token === WRITER
    ? {
        userId: "user-3",
        kind: "oauth",
        clientId: "client-2",
        scopes: ["needt.read", "needt.write"],
        workspaceId: "workspace-bound",
      }
    : null
);

beforeEach(() => {
  jest.clearAllMocks();
  namedFind.mockImplementation(async ({ where }) => {
    if (where.tokenHash === hashConnectorToken(NAMED)) return NAMED_ROW;
    if (where.tokenHash === hashConnectorToken(REVOKED)) {
      return { ...NAMED_ROW, id: "tok-old", revokedAt: new Date() };
    }
    return null;
  });
  findUnique.mockImplementation(async ({ where }) =>
    where.tokenHash === hashConnectorToken(PERSONAL)
      ? { userId: "user-1" }
      : null
  );
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue({
    enabled: true,
    workspaceId: "workspace-bound",
    workspaceKind: WorkspaceKind.SHARED,
    role: WorkspaceRole.EDITOR,
    dataScope: { mode: "workspace", workspaceId: "workspace-bound" },
  });
});

describe("authenticateBearer", () => {
  it("reads a personal token as its owner with every scope and no workspace", async () => {
    await expect(
      authenticateBearer(request(`Bearer ${PERSONAL}`))
    ).resolves.toEqual({
      userId: "user-1",
      kind: "personal",
      scopes: ["needt.read", "needt.write", "mail.read", "agents.hub"],
    });
    expect(PERSONAL_TOKEN_SCOPES).toEqual([
      "needt.read",
      "needt.write",
      "mail.read",
      "agents.hub",
    ]);
  });

  it("refuses a personal token past its expiry, keeps one without a date", async () => {
    const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
    findUnique.mockResolvedValueOnce({
      userId: "user-1",
      tokenExpiresAt: at(-1_000),
    });
    await expect(
      authenticateBearer(request(`Bearer ${PERSONAL}`))
    ).resolves.toBeNull();

    findUnique.mockResolvedValueOnce({
      userId: "user-1",
      tokenExpiresAt: at(60_000),
    });
    await expect(
      authenticateBearer(request(`Bearer ${PERSONAL}`))
    ).resolves.toMatchObject({ userId: "user-1", kind: "personal" });

    // Made before expiry existed: null keeps working.
    findUnique.mockResolvedValueOnce({
      userId: "user-1",
      tokenExpiresAt: null,
    });
    await expect(
      authenticateBearer(request(`Bearer ${PERSONAL}`))
    ).resolves.toMatchObject({ userId: "user-1" });
    expect(findUnique).toHaveBeenLastCalledWith({
      where: { tokenHash: hashConnectorToken(PERSONAL) },
      select: { userId: true, tokenExpiresAt: true, tokenLastUsedAt: true },
    });
  });

  it("reads a named personal token with the personal scopes and its id and name", async () => {
    await expect(
      authenticateBearer(request(`Bearer ${NAMED}`))
    ).resolves.toEqual({
      userId: "user-1",
      kind: "personal",
      scopes: PERSONAL_TOKEN_SCOPES,
      personalTokenId: "tok-chrome",
      personalTokenName: "Chrome",
    });
    // Never the admin scope, like the Default token.
    expect(PERSONAL_TOKEN_SCOPES).not.toContain("needt.admin.read");
  });

  it("refuses a revoked or expired named token, an unknown one stays null", async () => {
    await expect(
      authenticateBearer(request(`Bearer ${REVOKED}`))
    ).resolves.toBeNull();
    namedFind.mockResolvedValueOnce({
      ...NAMED_ROW,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(
      authenticateBearer(request(`Bearer ${NAMED}`))
    ).resolves.toBeNull();
  });

  it("keeps the Default token working beside named ones", async () => {
    const [def, named] = await Promise.all([
      authenticateBearer(request(`Bearer ${PERSONAL}`)),
      authenticateBearer(request(`Bearer ${NAMED}`)),
    ]);
    expect(def).toMatchObject({ userId: "user-1", kind: "personal" });
    expect(def?.personalTokenId).toBeUndefined();
    expect(named?.personalTokenId).toBe("tok-chrome");
  });

  it("records last use at most once a minute", async () => {
    await authenticateBearer(request(`Bearer ${NAMED}`));
    expect(namedUpdate).toHaveBeenCalledTimes(1);
    expect(namedUpdate).toHaveBeenCalledWith({
      where: { id: "tok-chrome" },
      data: { lastUsedAt: expect.any(Date) },
    });

    namedUpdate.mockClear();
    namedFind.mockResolvedValueOnce({ ...NAMED_ROW, lastUsedAt: new Date() });
    await authenticateBearer(request(`Bearer ${NAMED}`));
    expect(namedUpdate).not.toHaveBeenCalled();

    await authenticateBearer(request(`Bearer ${PERSONAL}`));
    expect(legacyUpdate).toHaveBeenCalledTimes(1);
    legacyUpdate.mockClear();
    findUnique.mockResolvedValueOnce({
      userId: "user-1",
      tokenExpiresAt: null,
      tokenLastUsedAt: new Date(),
    });
    await authenticateBearer(request(`Bearer ${PERSONAL}`));
    expect(legacyUpdate).not.toHaveBeenCalled();
  });

  it("still authenticates when recording last use fails", async () => {
    namedUpdate.mockRejectedValueOnce(new Error("db down"));
    await expect(
      authenticateBearer(request(`Bearer ${NAMED}`))
    ).resolves.toMatchObject({ personalTokenId: "tok-chrome" });
  });

  it("accepts the scheme in any case and refuses anything else", async () => {
    await expect(
      authenticateBearer(request(`bearer ${PERSONAL}`))
    ).resolves.toMatchObject({ userId: "user-1" });
    for (const header of [
      undefined,
      PERSONAL,
      `Basic ${PERSONAL}`,
      `Bearer ${PERSONAL} extra`,
      "Bearer needt_unknown",
    ]) {
      await expect(authenticateBearer(request(header))).resolves.toBeNull();
    }
  });

  it("asks registered resolvers for other token kinds", async () => {
    await expect(
      authenticateBearer(request(`Bearer ${OAUTH}`))
    ).resolves.toMatchObject({
      kind: "oauth",
      clientId: "client-1",
      workspaceId: "workspace-bound",
    });
    // A non-personal token never touches the connector table.
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("authenticateConnectorRequest", () => {
  it("maps roles to scopes", () => {
    expect(scopeForRole(WorkspaceRole.VIEWER)).toBe("needt.read");
    expect(scopeForRole(WorkspaceRole.EDITOR)).toBe("needt.write");
    expect(scopeForRole(WorkspaceRole.OWNER)).toBe("needt.write");
  });

  it("401s without a token, with the resource metadata challenge", async () => {
    const auth = await authenticateConnectorRequest(
      request(),
      WorkspaceRole.VIEWER
    );
    expect(auth.response?.status).toBe(401);
    expect(auth.response?.headers.get("www-authenticate")).toContain(
      "resource_metadata="
    );
  });

  it("403s insufficient_scope when a read-only grant writes", async () => {
    const auth = await authenticateConnectorRequest(
      request(`Bearer ${OAUTH}`),
      WorkspaceRole.EDITOR
    );
    expect(auth.response?.status).toBe(403);
    await expect(auth.response?.json()).resolves.toMatchObject({
      error: "insufficient_scope",
    });
  });

  it("keeps an OAuth grant in its bound workspace", async () => {
    const ok = await authenticateConnectorRequest(
      request(`Bearer ${OAUTH}`),
      WorkspaceRole.VIEWER
    );
    expect(ok.response).toBeUndefined();
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestedWorkspaceId: "workspace-bound" })
    );

    const other = await authenticateConnectorRequest(
      request(`Bearer ${OAUTH}`, "?workspaceId=workspace-other"),
      WorkspaceRole.VIEWER
    );
    expect(other.response?.status).toBe(403);
  });

  it("lets a personal token pick any workspace it is a member of", async () => {
    await authenticateConnectorRequest(
      request(`Bearer ${PERSONAL}`, "?workspaceId=workspace-7"),
      WorkspaceRole.EDITOR
    );
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestedWorkspaceId: "workspace-7",
      })
    );
  });

  it("asks for the extra scopes a call names, on top of its role's", async () => {
    const withoutMail = await authenticateConnectorRequest(
      request(`Bearer ${WRITER}`),
      WorkspaceRole.EDITOR,
      { extraScopes: ["mail.read"] }
    );
    expect(withoutMail.response?.status).toBe(403);
    await expect(withoutMail.response?.json()).resolves.toMatchObject({
      error: "insufficient_scope",
      scope: expect.stringContaining("mail.read"),
    });

    const withMail = await authenticateConnectorRequest(
      request(`Bearer ${PERSONAL}`),
      WorkspaceRole.EDITOR,
      { extraScopes: ["mail.read"] }
    );
    expect(withMail.response).toBeUndefined();
  });

  it("needs the write scope for a call marked as a write, whatever its role", async () => {
    const readOnly = await authenticateConnectorRequest(
      request(`Bearer ${OAUTH}`),
      WorkspaceRole.VIEWER,
      { write: true }
    );
    expect(readOnly.response?.status).toBe(403);
    expect(resolveWorkspaceAccess).not.toHaveBeenCalled();

    const writer = await authenticateConnectorRequest(
      request(`Bearer ${WRITER}`),
      WorkspaceRole.VIEWER,
      { write: true }
    );
    expect(writer.response).toBeUndefined();
  });

  it("rate limits each person's writes, never their reads", async () => {
    await authenticateConnectorRequest(
      request(`Bearer ${WRITER}`),
      WorkspaceRole.VIEWER
    );
    expect(enforceRateLimits).not.toHaveBeenCalled();

    jest.mocked(resolveWorkspaceAccess).mockClear();
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValueOnce(
        NextResponse.json({ error: "Too many attempts." }, { status: 429 })
      );
    const limited = await authenticateConnectorRequest(
      request(`Bearer ${WRITER}`),
      WorkspaceRole.EDITOR
    );
    expect(limited.response?.status).toBe(429);
    expect(accountRule).toHaveBeenCalledWith(
      "user-3",
      "connect:write",
      CONNECT_WRITE_LIMIT_PER_MINUTE,
      60
    );
    expect(resolveWorkspaceAccess).not.toHaveBeenCalled();
  });
});
