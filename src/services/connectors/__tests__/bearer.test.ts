import { NextRequest } from "next/server";

import {
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn() },
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

const findUnique = prisma.connectorSettings.findUnique as jest.Mock;
const PERSONAL = "needt_personal-connector-token-value";
const OAUTH = "ext_other-kind-token-value";

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

beforeEach(() => {
  jest.clearAllMocks();
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
      scopes: ["needt.read", "needt.write", "mail.read"],
    });
    expect(PERSONAL_TOKEN_SCOPES).toEqual([
      "needt.read",
      "needt.write",
      "mail.read",
    ]);
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
});
