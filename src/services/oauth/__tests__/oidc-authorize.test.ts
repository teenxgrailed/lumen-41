import { getServerSession } from "next-auth";

import AuthorizePage from "@/app/oauth/authorize/page";
import { validateAuthorizationRequest } from "@/services/oauth/authorize";
import { resolveClient } from "@/services/oauth/clients";
import {
  firstPartyRedirectUris,
  isFirstParty,
} from "@/services/oauth/first-party";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: { findUnique: jest.fn(), upsert: jest.fn() },
    oAuthAuthorizationCode: { create: jest.fn() },
  },
}));
jest.mock("next-auth", () => ({
  ...jest.requireActual("next-auth"),
  getServerSession: jest.fn(),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/auth/admin-role", () => ({
  isAdminUserId: jest.fn().mockResolvedValue(false),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
jest.mock("@/services/oauth/limits", () => ({
  AUTHORIZE_LIMIT_PER_MINUTE: 30,
  cimdFetchGuard: jest.fn(() => undefined),
  ipFromHeaders: jest.fn(() => "203.0.113.9"),
  limitAuthorize: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/services/oauth/consent", () => ({
  ...jest.requireActual("@/services/oauth/consent"),
  consentWorkspaces: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/app/oauth/authorize/WorkspacePicker", () => ({
  WorkspacePicker: () => null,
}));

const BUDGET_REDIRECT = "https://budget.needt.app/auth/needt/callback";
const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

const budgetRow = {
  id: "client-db-1",
  clientId: "needt-budget",
  kind: "first_party",
  name: "Needt Budget",
  redirectUris: [BUDGET_REDIRECT],
};

const original = { ...process.env };
beforeAll(() => {
  // Task N2 refuses openid requests when there is no signing key, so every
  // test here runs with a throwaway one.
  process.env.OIDC_SIGNING_KEY = crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
});
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://use.needt.app";
  process.env.OIDC_BUDGET_REDIRECT_URIS = BUDGET_REDIRECT;
  (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(budgetRow);
  (prisma.oAuthClient.upsert as jest.Mock).mockResolvedValue(budgetRow);
});
afterAll(() => {
  process.env = original;
});

function openidParams(extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: "needt-budget",
    redirect_uri: BUDGET_REDIRECT,
    scope: "openid email profile",
    state: "state-1",
    nonce: "nonce-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  });
}

describe("first-party clients", () => {
  it("first-party client resolves from env redirect URIs without registration", async () => {
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);
    process.env.OIDC_BUDGET_REDIRECT_URIS = ` ${BUDGET_REDIRECT} , http://localhost:8000/auth/needt/callback ,, javascript:alert(1)`;

    const client = await resolveClient("needt-budget");

    expect(firstPartyRedirectUris("needt-budget")).toEqual([
      BUDGET_REDIRECT,
      "http://localhost:8000/auth/needt/callback",
    ]);
    expect(prisma.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "needt-budget" },
        create: expect.objectContaining({
          clientId: "needt-budget",
          kind: "first_party",
          name: "Needt Budget",
          redirectUris: [
            BUDGET_REDIRECT,
            "http://localhost:8000/auth/needt/callback",
          ],
        }),
      })
    );
    expect(isFirstParty(client)).toBe(true);
  });

  it("refreshes the stored redirect URIs when the env changed", async () => {
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
      ...budgetRow,
      redirectUris: ["https://old.example/cb"],
    });
    await resolveClient("needt-budget");
    expect(prisma.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ redirectUris: [BUDGET_REDIRECT] }),
      })
    );
  });

  it("does not write when the stored client already matches the env", async () => {
    await resolveClient("needt-budget");
    expect(prisma.oAuthClient.upsert).not.toHaveBeenCalled();
  });
});

describe("openid authorization requests", () => {
  it("an openid request from needt-budget is valid without resource", async () => {
    const result = await validateAuthorizationRequest(openidParams());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.oidc).toEqual({ nonce: "nonce-1" });
    expect(result.request.scopes).toEqual(["openid", "email", "profile"]);
    expect(result.request.resource).toBe("");
    expect(result.request.state).toBe("state-1");
  });

  it("keeps a missing nonce as null", async () => {
    const params = openidParams();
    params.delete("nonce");
    const result = await validateAuthorizationRequest(params);
    expect(result.ok && result.request.oidc).toEqual({ nonce: null });
  });

  it("an openid request from a dynamic client is rejected with invalid_scope", async () => {
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue({
      id: "c-dcr",
      clientId: "ndt_client_abc",
      kind: "dcr",
      name: "Some MCP client",
      redirectUris: ["https://client.example/cb"],
    });
    const result = await validateAuthorizationRequest(
      openidParams({
        client_id: "ndt_client_abc",
        redirect_uri: "https://client.example/cb",
        resource: "https://mcp.needt.app/mcp",
      })
    );
    expect(result).toMatchObject({
      ok: false,
      kind: "redirect",
      error: "invalid_scope",
    });
  });

  it("refuses openid mixed with MCP scopes and unknown scopes", async () => {
    for (const scope of ["openid needt.read", "openid phone", "openid admin"]) {
      expect(
        await validateAuthorizationRequest(openidParams({ scope }))
      ).toMatchObject({ ok: false, error: "invalid_scope" });
    }
  });

  it("refuses email or profile without openid, and a non-openid request from a first-party client", async () => {
    for (const scope of ["email profile", "needt.read", ""]) {
      expect(
        await validateAuthorizationRequest(
          openidParams({
            scope,
            resource: "https://mcp.needt.app/mcp",
          })
        )
      ).toMatchObject({ ok: false, error: "invalid_scope" });
    }
  });

  it("still sends nothing to an unregistered redirect URI", async () => {
    expect(
      await validateAuthorizationRequest(
        openidParams({ redirect_uri: "https://evil.example/cb" })
      )
    ).toMatchObject({ ok: false, kind: "page" });
  });

  it("mcp requests without openid still require resource and consent", async () => {
    const dcr = {
      id: "c-dcr",
      clientId: "ndt_client_abc",
      kind: "dcr",
      name: "Some MCP client",
      redirectUris: ["https://client.example/cb"],
    };
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(dcr);
    const mcp = (extra: Record<string, string> = {}) =>
      new URLSearchParams({
        response_type: "code",
        client_id: "ndt_client_abc",
        redirect_uri: "https://client.example/cb",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...extra,
      });

    // No resource: refused, exactly as before.
    expect(await validateAuthorizationRequest(mcp())).toMatchObject({
      ok: false,
      kind: "redirect",
      error: "invalid_target",
    });

    // With a resource it is a plain MCP request without any OIDC state...
    const ok = await validateAuthorizationRequest(
      mcp({ resource: "https://mcp.needt.app/mcp", scope: "needt.read" })
    );
    expect(ok.ok && ok.request.oidc).toBeNull();

    // ...and the page shows the consent screen instead of issuing a code.
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "user-1", email: "a@b.c" },
    });
    const page = await AuthorizePage({
      searchParams: Promise.resolve(
        Object.fromEntries(
          mcp({
            resource: "https://mcp.needt.app/mcp",
            scope: "needt.read",
          }).entries()
        )
      ),
    });
    expect(JSON.stringify(page)).toContain("/oauth/authorize/decision");
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });
});

describe("the authorize page for a first-party client", () => {
  const searchParams = () =>
    Promise.resolve(Object.fromEntries(openidParams().entries()));

  it("a signed-in person gets a code for needt-budget without a consent screen", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "user-1", email: "a@b.c" },
    });
    (prisma.oAuthAuthorizationCode.create as jest.Mock).mockResolvedValue({});

    let redirected = "";
    try {
      await AuthorizePage({ searchParams: searchParams() });
    } catch (error) {
      redirected = (error as Error).message.replace("NEXT_REDIRECT ", "");
    }

    const target = new URL(redirected);
    expect(`${target.origin}${target.pathname}`).toBe(BUDGET_REDIRECT);
    expect(target.searchParams.get("code")).toMatch(/^ndt_oac_/);
    expect(target.searchParams.get("state")).toBe("state-1");
    expect(target.searchParams.get("iss")).toBe("https://use.needt.app");
  });

  it("nonce is stored with the authorization code", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
    (prisma.oAuthAuthorizationCode.create as jest.Mock).mockResolvedValue({});

    await AuthorizePage({ searchParams: searchParams() }).catch(() => null);

    expect(prisma.oAuthAuthorizationCode.create).toHaveBeenCalledTimes(1);
    const { data } = (prisma.oAuthAuthorizationCode.create as jest.Mock).mock
      .calls[0][0];
    expect(data).toMatchObject({
      clientId: "client-db-1",
      userId: "user-1",
      redirectUri: BUDGET_REDIRECT,
      codeChallenge: challenge,
      scope: "openid email profile",
      resource: "",
      nonce: "nonce-1",
      workspaceId: null,
    });
    expect(data.authTime).toBeInstanceOf(Date);
  });

  it("a signed-out person is sent to sign-in and brought back", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    let redirected = "";
    try {
      await AuthorizePage({ searchParams: searchParams() });
    } catch (error) {
      redirected = (error as Error).message.replace("NEXT_REDIRECT ", "");
    }
    expect(redirected).toMatch(/^\/auth\/signin\?callbackUrl=/);
    const back = decodeURIComponent(redirected.split("callbackUrl=")[1]);
    expect(back).toContain("/oauth/authorize?");
    expect(back).toContain("nonce=nonce-1");
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });
});
