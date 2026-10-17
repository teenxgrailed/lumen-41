/**
 * The whole OAuth flow against a real database, through the route handlers:
 * register → consent → code → token → MCP call → refresh rotation → replay
 * → revoke. Runs with OAUTH_INTEGRATION=1 (CI sets it next to Postgres).
 */
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { POST as mcpPost } from "@/app/api/mcp/route";
import { GET as connectedAppsGet } from "@/app/api/oauth/connected-apps/route";
import { POST as decisionPost } from "@/app/oauth/authorize/decision/route";
import { POST as registerPost } from "@/app/oauth/register/route";
import { POST as revokePost } from "@/app/oauth/revoke/route";
import { POST as tokenPost } from "@/app/oauth/token/route";
import { authenticateBearer } from "@/services/connectors/bearer";
import { validateAuthorizationRequest } from "@/services/oauth/authorize";
import { cleanupOAuth } from "@/services/oauth/cleanup";
import { WorkspaceKind } from "@prisma/client";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";

const describeIntegration =
  process.env.OAUTH_INTEGRATION === "1" ? describe : describe.skip;

jest.mock("next-auth", () => ({
  ...jest.requireActual("next-auth"),
  getServerSession: jest.fn(),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  ...jest.requireActual("@/lib/security/rate-limit"),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/auth/api-auth", () => ({
  ...jest.requireActual("@/lib/auth/api-auth"),
  authenticateRequest: jest.fn(async () => ({
    userId: (globalThis as { __oauthUser?: string }).__oauthUser,
    workspace: undefined,
  })),
}));

const APP = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const RESOURCE = "https://mcp.needt.app/mcp";
const run = `oauth${Date.now().toString(36)}`;
const userId = `${run}-user`;
const workspaceId = `${run}-ws`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

function form(
  url: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {}
) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function register(redirectUris = [REDIRECT]) {
  const response = await registerPost(
    new NextRequest(`${APP}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude",
        redirect_uris: redirectUris,
      }),
    })
  );
  expect(response.status).toBe(201);
  return (await response.json()).client_id as string;
}

async function consent(
  clientId: string,
  extra: Record<string, string> = {},
  redirectUri = REDIRECT
) {
  const response = await decisionPost(
    form(
      `${APP}/oauth/authorize/decision`,
      {
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state: "st-1",
        scope: "needt.read needt.write mail.read",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: RESOURCE,
        decision: "allow",
        write: "on",
        workspaceId,
        ...extra,
      },
      { origin: new URL(APP).origin }
    )
  );
  return response;
}

function codeOf(response: Response) {
  const location = new URL(response.headers.get("location")!);
  return { location, code: location.searchParams.get("code")! };
}

async function token(fields: Record<string, string>) {
  const response = await tokenPost(form(`${APP}/oauth/token`, fields));
  return { status: response.status, body: await response.json() };
}

async function exchange(
  clientId: string,
  code: string,
  overrides: Record<string, string> = {}
) {
  return token({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    resource: RESOURCE,
    ...overrides,
  });
}

describeIntegration("OAuth 2.1 server (real database)", () => {
  beforeAll(async () => {
    process.env.MCP_RESOURCE_URL = RESOURCE;
    (globalThis as { __oauthUser?: string }).__oauthUser = userId;
    await prisma.user.create({
      data: { id: userId, email: `${run}@example.test` },
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Personal",
        kind: WorkspaceKind.PERSONAL,
        personalOwnerId: userId,
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId, userId, role: "OWNER" },
    });
    jest.mocked(getServerSession).mockResolvedValue({
      user: { id: userId, email: `${run}@example.test` },
    } as never);
  });

  afterAll(async () => {
    await prisma.oAuthClient.deleteMany({
      where: { tokens: { some: { userId } } },
    });
    await prisma.oAuthClient.deleteMany({
      where: { codes: { some: { userId } } },
    });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("issues a scoped, workspace-bound token that the MCP server accepts", async () => {
    const clientId = await register();
    const response = await consent(clientId);
    expect(response.status).toBe(303);
    const { location, code } = codeOf(response);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("st-1");
    expect(location.searchParams.get("iss")).toBe(new URL(APP).origin);
    expect(code).toMatch(/^ndt_oac_/);

    const tokens = await exchange(clientId, code);
    expect(tokens.status).toBe(200);
    expect(tokens.body).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "needt.read needt.write",
    });

    // Mail was asked for but not ticked: not granted.
    const bearer = await authenticateBearer(
      new Request("http://x", {
        headers: { authorization: `Bearer ${tokens.body.access_token}` },
      })
    );
    expect(bearer).toMatchObject({
      userId,
      kind: "oauth",
      clientId,
      workspaceId,
      scopes: ["needt.read", "needt.write"],
    });

    const whoami = await mcpPost(
      new NextRequest("https://mcp.needt.app/api/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokens.body.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "needt_whoami", arguments: {} },
        }),
      })
    );
    const text = JSON.parse((await whoami.json()).result.content[0].text);
    expect(text.token).toMatchObject({
      kind: "oauth",
      boundWorkspaceId: workspaceId,
    });

    const mail = await mcpPost(
      new NextRequest("https://mcp.needt.app/api/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokens.body.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "needt_list", arguments: { type: "mail" } },
        }),
      })
    );
    expect(mail.status).toBe(403);
    expect(mail.headers.get("www-authenticate")).toContain(
      "insufficient_scope"
    );

    const appsResponse = await connectedAppsGet(
      new NextRequest(`${APP}/api/oauth/connected-apps`)
    );
    const apps = await appsResponse!.json();
    expect(apps.apps).toEqual([
      expect.objectContaining({
        clientName: "Claude",
        scopes: ["needt.read", "needt.write"],
      }),
    ]);
  });

  it("refuses a replayed code and revokes what it produced", async () => {
    const clientId = await register();
    const { code } = codeOf(await consent(clientId));
    const first = await exchange(clientId, code);
    expect(first.status).toBe(200);
    const replay = await exchange(clientId, code);
    expect(replay).toMatchObject({
      status: 400,
      body: { error: "invalid_grant" },
    });
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${first.body.access_token}` },
        })
      )
    ).resolves.toBeNull();
  });

  it("refuses a wrong verifier, another redirect, another client and an expired code", async () => {
    const clientId = await register();
    const other = await register();
    const wrongVerifier = codeOf(await consent(clientId)).code;
    expect(
      await exchange(clientId, wrongVerifier, {
        code_verifier: crypto.randomBytes(48).toString("base64url"),
      })
    ).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    const wrongRedirect = codeOf(await consent(clientId)).code;
    expect(
      await exchange(clientId, wrongRedirect, {
        redirect_uri: "https://claude.ai/other",
      })
    ).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    const wrongClient = codeOf(await consent(clientId)).code;
    expect(await exchange(other, wrongClient)).toMatchObject({
      status: 400,
      body: { error: "invalid_grant" },
    });
    const expired = codeOf(await consent(clientId)).code;
    await prisma.oAuthAuthorizationCode.updateMany({
      where: {
        clientId: (
          await prisma.oAuthClient.findUniqueOrThrow({ where: { clientId } })
        ).id,
        usedAt: null,
      },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await exchange(clientId, expired)).toMatchObject({
      status: 400,
      body: { error: "invalid_grant" },
    });
  });

  it("refuses a resource that is not the canonical one, byte for byte", async () => {
    const clientId = await register();
    for (const resource of [
      "https://mcp.needt.app/mcp/",
      "https://MCP.needt.app/mcp",
      "https://use.needt.app/api/mcp/",
      "https://evil.example/api/mcp",
    ]) {
      const { code } = codeOf(await consent(clientId));
      expect(await exchange(clientId, code, { resource })).toMatchObject({
        status: 400,
        body: { error: "invalid_target" },
      });
    }
    const missing = codeOf(await consent(clientId)).code;
    expect(await exchange(clientId, missing, { resource: "" })).toMatchObject({
      status: 400,
      body: { error: "invalid_target" },
    });
  });

  it("rotates refresh tokens and revokes the family when a rotated one returns", async () => {
    const clientId = await register();
    const first = await exchange(
      clientId,
      codeOf(await consent(clientId)).code
    );
    const refresh = (rt: string) =>
      token({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: rt,
        resource: RESOURCE,
      });

    const second = await refresh(first.body.refresh_token);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(first.body.refresh_token);
    // The old access token stops with the rotation.
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${first.body.access_token}` },
        })
      )
    ).resolves.toBeNull();

    const reuse = await refresh(first.body.refresh_token);
    expect(reuse).toMatchObject({
      status: 400,
      body: { error: "invalid_grant" },
    });
    // The whole family is gone, including the newest pair.
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${second.body.access_token}` },
        })
      )
    ).resolves.toBeNull();
    expect(await refresh(second.body.refresh_token)).toMatchObject({
      status: 400,
      body: { error: "invalid_grant" },
    });
  });

  it("lets a refresh narrow scopes but never widen them", async () => {
    const clientId = await register();
    const first = await exchange(
      clientId,
      codeOf(await consent(clientId)).code
    );
    const wider = await token({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: first.body.refresh_token,
      scope: "needt.read mail.read",
    });
    expect(wider).toMatchObject({
      status: 400,
      body: { error: "invalid_scope" },
    });
  });

  it("revokes a grant through /oauth/revoke and answers 200 for unknown tokens", async () => {
    const clientId = await register();
    const first = await exchange(
      clientId,
      codeOf(await consent(clientId)).code
    );
    const revoke = (t: string) =>
      revokePost(
        form(`${APP}/oauth/revoke`, { token: t, client_id: clientId })
      );
    expect((await revoke(first.body.refresh_token)).status).toBe(200);
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${first.body.access_token}` },
        })
      )
    ).resolves.toBeNull();
    expect((await revoke("ndt_ort_unknown")).status).toBe(200);
  });

  it("accepts any port on a registered loopback redirect (Claude Code)", async () => {
    const clientId = await register(["http://127.0.0.1/callback"]);
    const redirect = "http://127.0.0.1:61234/callback";
    const response = await consent(clientId, {}, redirect);
    const { code } = codeOf(response);
    expect(
      await exchange(clientId, code, { redirect_uri: redirect })
    ).toMatchObject({ status: 200 });
  });

  it("never redirects to an unregistered URI (no open redirect)", async () => {
    const clientId = await register();
    for (const evil of [
      "https://evil.example/cb",
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "http://claude.ai/api/mcp/auth_callback",
    ]) {
      const result = await validateAuthorizationRequest(
        new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: evil,
          code_challenge: challenge,
          code_challenge_method: "S256",
        })
      );
      expect(result).toMatchObject({ ok: false, kind: "page" });
      const response = await consent(clientId, {}, evil);
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    }
    const unknownClient = await validateAuthorizationRequest(
      new URLSearchParams({
        client_id: "ndt_client_nope",
        redirect_uri: REDIRECT,
      })
    );
    expect(unknownClient).toMatchObject({ ok: false, kind: "page" });
  });

  it("refuses a consent POST from another origin and a workspace that is not the person's", async () => {
    const clientId = await register();
    const crossSite = await decisionPost(
      form(
        `${APP}/oauth/authorize/decision`,
        { client_id: clientId, redirect_uri: REDIRECT, decision: "allow" },
        { origin: "https://evil.example" }
      )
    );
    expect(crossSite.status).toBe(403);
    const notMine = await consent(clientId, { workspaceId: "someone-elses" });
    expect(notMine.status).toBe(400);
  });

  it("identifies a CIMD client by its document and checks redirects against it", async () => {
    const url = `https://client.example/${run}/oauth-client.json`;
    const doc = (overrides: Record<string, unknown> = {}) => ({
      lookup: async (host: string) =>
        host === "client.example" ? ["93.184.216.34"] : ["10.0.0.1"],
      get: async () => ({
        status: 200,
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            client_id: url,
            client_name: "ChatGPT",
            redirect_uris: [
              "https://chatgpt.com/connector_platform_oauth_redirect",
            ],
            ...overrides,
          })
        ),
      }),
    });
    const params = (redirect: string) =>
      new URLSearchParams({
        response_type: "code",
        client_id: url,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: RESOURCE,
      });
    const ok = await validateAuthorizationRequest(
      params("https://chatgpt.com/connector_platform_oauth_redirect"),
      { deps: doc() }
    );
    expect(ok).toMatchObject({
      ok: true,
      request: { client: { kind: "cimd", name: "ChatGPT", clientId: url } },
    });

    const otherRedirect = await validateAuthorizationRequest(
      params("https://evil.example/cb"),
      { deps: doc() }
    );
    expect(otherRedirect).toMatchObject({ ok: false, kind: "page" });

    await prisma.oAuthClient.update({
      where: { clientId: url },
      data: { metadataFetchedAt: new Date(0) },
    });
    const forged = await validateAuthorizationRequest(
      params("https://chatgpt.com/connector_platform_oauth_redirect"),
      { deps: doc({ client_id: "https://other.example/x" }) }
    );
    expect(forged).toMatchObject({
      ok: false,
      kind: "page",
      error: "invalid_client",
    });

    const internal = await validateAuthorizationRequest(
      new URLSearchParams({
        client_id: `https://internal.example/${run}/c.json`,
        redirect_uri: REDIRECT,
      }),
      { deps: doc() }
    );
    expect(internal).toMatchObject({
      ok: false,
      kind: "page",
      error: "invalid_client",
    });
    await prisma.oAuthClient.deleteMany({ where: { clientId: url } });
  });

  it("two concurrent exchanges of one code leave no live token", async () => {
    const clientId = await register();
    const { code } = codeOf(await consent(clientId));
    const results = await Promise.all([
      exchange(clientId, code),
      exchange(clientId, code),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = results.find((r) => r.status === 200)!;
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${winner.body.access_token}` },
        })
      )
    ).resolves.toBeNull();
  });

  it("two concurrent uses of one refresh token leave no live token", async () => {
    const clientId = await register();
    const first = await exchange(
      clientId,
      codeOf(await consent(clientId)).code
    );
    const refresh = () =>
      token({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: first.body.refresh_token,
        resource: RESOURCE,
      });
    const results = await Promise.all([refresh(), refresh()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    for (const r of [first, ...results.filter((x) => x.status === 200)]) {
      await expect(
        authenticateBearer(
          new Request("http://x", {
            headers: { authorization: `Bearer ${r.body.access_token}` },
          })
        )
      ).resolves.toBeNull();
    }
  });

  it("limits the consent POST before looking at the request", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValueOnce(
        NextResponse.json({ error: "slow" }, { status: 429 })
      );
    const response = await decisionPost(
      form(
        `${APP}/oauth/authorize/decision`,
        {
          client_id: "https://cimd.example/never-fetched.json",
          redirect_uri: REDIRECT,
        },
        { origin: new URL(APP).origin }
      )
    );
    expect(response.status).toBe(429);
    expect(
      await prisma.oAuthClient.findUnique({
        where: { clientId: "https://cimd.example/never-fetched.json" },
      })
    ).toBeNull();
  });

  it("requires resource at /oauth/authorize", async () => {
    const clientId = await register();
    const result = await validateAuthorizationRequest(
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
      })
    );
    expect(result).toMatchObject({
      ok: false,
      kind: "redirect",
      error: "invalid_target",
    });
  });

  it("the worker cleanup removes ended codes and tokens, keeps live ones", async () => {
    const clientId = await register();
    const live = await exchange(clientId, codeOf(await consent(clientId)).code);
    const client = await prisma.oAuthClient.findUniqueOrThrow({
      where: { clientId },
    });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: `${run}-old-code`,
        clientId: client.id,
        userId,
        redirectUri: REDIRECT,
        codeChallenge: challenge,
        scope: "needt.read",
        resource: RESOURCE,
        familyId: `${run}-old`,
        expiresAt: old,
      },
    });
    await prisma.oAuthToken.create({
      data: {
        tokenHash: `${run}-old-token`,
        type: "refresh",
        familyId: `${run}-old`,
        clientId: client.id,
        userId,
        scope: "needt.read",
        resource: RESOURCE,
        expiresAt: old,
        revokedAt: old,
      },
    });
    const counts = await cleanupOAuth();
    expect(counts.codes).toBeGreaterThanOrEqual(1);
    expect(counts.tokens).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash: `${run}-old-code` },
      })
    ).toBeNull();
    expect(
      await prisma.oAuthToken.findUnique({
        where: { tokenHash: `${run}-old-token` },
      })
    ).toBeNull();
    await expect(
      authenticateBearer(
        new Request("http://x", {
          headers: { authorization: `Bearer ${live.body.access_token}` },
        })
      )
    ).resolves.toMatchObject({ kind: "oauth" });
  });

  it("sends a denial back to the client with iss", async () => {
    const clientId = await register();
    const { location } = codeOf(await consent(clientId, { decision: "deny" }));
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("iss")).toBe(new URL(APP).origin);
    expect(location.searchParams.get("code")).toBeNull();
  });
});
