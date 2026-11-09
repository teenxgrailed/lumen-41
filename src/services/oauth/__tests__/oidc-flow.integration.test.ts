/**
 * Sign in with a Needt account against a real database, through the route
 * handlers: consent-free authorization → code → token (id_token, no refresh
 * token) → JWKS → userinfo → replay. Runs with OAUTH_INTEGRATION=1, like
 * oauth-flow.integration.test.ts.
 */
import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";

import { POST as decisionPost } from "@/app/oauth/authorize/decision/route";
import { GET as jwksGet } from "@/app/oauth/jwks/route";
import { POST as tokenPost } from "@/app/oauth/token/route";
import { GET as userinfoGet } from "@/app/oauth/userinfo/route";
import { authenticateBearer } from "@/services/connectors/bearer";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

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

const APP = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const BUDGET_REDIRECT = "https://budget.needt.app/auth/needt/callback";
const run = `oidc${Date.now().toString(36)}`;
const userId = `${run}-user`;
const email = `${run}@example.test`;

const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

function form(url: string, fields: Record<string, string>, headers = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function authorize(extra: Record<string, string> = {}) {
  const response = await decisionPost(
    form(
      `${APP}/oauth/authorize/decision`,
      {
        response_type: "code",
        client_id: "needt-budget",
        redirect_uri: BUDGET_REDIRECT,
        scope: "openid email profile",
        state: "st-1",
        nonce: "nonce-1",
        code_challenge: challenge,
        code_challenge_method: "S256",
        decision: "allow",
        ...extra,
      },
      { origin: new URL(APP).origin }
    )
  );
  return response;
}

async function exchange(code: string, extra: Record<string, string> = {}) {
  const response = await tokenPost(
    form(`${APP}/oauth/token`, {
      grant_type: "authorization_code",
      client_id: "needt-budget",
      code,
      redirect_uri: BUDGET_REDIRECT,
      code_verifier: verifier,
      ...extra,
    })
  );
  return { status: response.status, body: await response.json() };
}

const userinfo = (accessToken: string) =>
  userinfoGet(
    new NextRequest(`${APP}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
  );

describeIntegration("Sign in with a Needt account (real database)", () => {
  const original = { ...process.env };

  beforeAll(async () => {
    process.env.OIDC_SIGNING_KEY = crypto
      .generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    process.env.OIDC_BUDGET_REDIRECT_URIS = BUDGET_REDIRECT;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        name: "Test Person",
        emailVerified: new Date(),
      },
    });
    jest.mocked(getServerSession).mockResolvedValue({
      user: { id: userId, email },
    } as never);
  });

  afterAll(async () => {
    await prisma.oAuthClient.deleteMany({
      where: { codes: { some: { userId } } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    process.env = original;
  });

  it("signs a person in: code, id_token that verifies against the jwks, userinfo, replay", async () => {
    const response = await authorize();
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(BUDGET_REDIRECT);
    expect(location.searchParams.get("state")).toBe("st-1");
    expect(location.searchParams.get("iss")).toBe(new URL(APP).origin);
    const code = location.searchParams.get("code")!;
    expect(code).toMatch(/^ndt_oac_/);

    const stored = await prisma.oAuthAuthorizationCode.findFirstOrThrow({
      where: { userId },
    });
    expect(stored).toMatchObject({ nonce: "nonce-1", resource: "" });
    expect(stored.authTime).toBeInstanceOf(Date);

    const tokens = await exchange(code);
    expect(tokens.status).toBe(200);
    expect(tokens.body).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
    });
    expect(tokens.body).not.toHaveProperty("refresh_token");

    const [header, payload, signature] = tokens.body.id_token.split(".");
    const { keys } = await (await jwksGet()).json();
    const jwk = keys.find(
      (key: { kid: string }) =>
        key.kid === JSON.parse(Buffer.from(header, "base64url").toString()).kid
    );
    expect(
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        crypto.createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(signature, "base64url")
      )
    ).toBe(true);
    expect(
      JSON.parse(Buffer.from(payload, "base64url").toString())
    ).toMatchObject({
      iss: new URL(APP).origin,
      sub: userId,
      aud: "needt-budget",
      nonce: "nonce-1",
      email,
      email_verified: false,
      name: "Test Person",
    });

    const info = await userinfo(tokens.body.access_token);
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ sub: userId, email });

    // The OIDC access token is not an MCP one.
    await expect(
      authenticateBearer({
        headers: new Headers({
          authorization: `Bearer ${tokens.body.access_token}`,
        }),
      })
    ).resolves.toBeNull();

    // A second use of the code is refused and ends what it produced.
    const replay = await exchange(code);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    expect((await userinfo(tokens.body.access_token)).status).toBe(401);
  });

  it("refuses a wrong verifier without spending the person's session", async () => {
    const code = new URL(
      (await authorize()).headers.get("location")!
    ).searchParams.get("code")!;
    const bad = await exchange(code, { code_verifier: "x".repeat(60) });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_grant");
  });

  it("does not let another client or a hand-made request ask for openid", async () => {
    const dcr = await prisma.oAuthClient.create({
      data: {
        clientId: `${run}-dcr`,
        kind: "dcr",
        name: "Some MCP client",
        redirectUris: ["https://client.example/cb"],
      },
    });
    try {
      const response = await authorize({
        client_id: dcr.clientId,
        redirect_uri: "https://client.example/cb",
      });
      expect(response.status).toBe(303);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).toBe("invalid_scope");
      expect(location.searchParams.get("code")).toBeNull();
    } finally {
      await prisma.oAuthClient.delete({ where: { id: dcr.id } });
    }
  });
});
