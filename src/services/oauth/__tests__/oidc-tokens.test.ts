import { NextRequest } from "next/server";

import { GET as discoveryGet } from "@/app/.well-known/openid-configuration/route";
import { GET as jwksGet } from "@/app/oauth/jwks/route";
import { GET as userinfoGet } from "@/app/oauth/userinfo/route";
import {
  OAuthError,
  exchangeAuthorizationCode,
  resolveAccessToken,
} from "@/services/oauth/grants";
import { loadSigningKey } from "@/services/oauth/oidc";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => {
  const prismaMock = {
    $transaction: jest.fn(),
    oAuthAuthorizationCode: { findUnique: jest.fn(), updateMany: jest.fn() },
    oAuthToken: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    oAuthClient: { update: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prismaMock)
  );
  return { prisma: prismaMock };
});
jest.mock("@/lib/security/rate-limit", () => ({
  ...jest.requireActual("@/lib/security/rate-limit"),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));

const ISSUER = "https://use.needt.app";
const REDIRECT = "https://budget.needt.app/auth/needt/callback";
const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");
const AUTH_TIME = new Date("2026-11-02T10:00:00.000Z");

function newPem() {
  return crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
}

function storedCode(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    clientId: "client-db-1",
    userId: "user-1",
    redirectUri: REDIRECT,
    codeChallenge: challenge,
    scope: "openid email profile",
    resource: "",
    workspaceId: null,
    nonce: "nonce-1",
    authTime: AUTH_TIME,
    familyId: "family-1",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    ...overrides,
  };
}

const person = {
  id: "user-1",
  email: "Maksym@Example.com",
  emailVerified: new Date("2026-10-01T00:00:00.000Z"),
  name: "Maksym",
};

function decode(jwt: string) {
  const [header, payload, signature] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    payload: JSON.parse(Buffer.from(payload, "base64url").toString()),
    signingInput: `${header}.${payload}`,
    signature: Buffer.from(signature, "base64url"),
  };
}

/** RFC 7638 thumbprint of an RSA public key, computed here independently. */
function thumbprint(jwk: { e: string; n: string }) {
  return crypto
    .createHash("sha256")
    .update(`{"e":"${jwk.e}","kty":"RSA","n":"${jwk.n}"}`)
    .digest("base64url");
}

async function exchange(overrides: Record<string, unknown> = {}) {
  return exchangeAuthorizationCode({
    code: "ndt_oac_code",
    clientDbId: "client-db-1",
    redirectUri: REDIRECT,
    codeVerifier: verifier,
    resource: null,
    firstPartyClientId: "needt-budget",
    ...overrides,
  });
}

const original = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = ISSUER;
  process.env.RATE_LIMIT_HASH_SECRET = "test-only-rate-limit-secret";
  delete process.env.OAUTH_ISSUER_URL;
  process.env.OIDC_SIGNING_KEY = newPem();
  (prisma.oAuthAuthorizationCode.findUnique as jest.Mock).mockResolvedValue(
    storedCode()
  );
  (prisma.oAuthAuthorizationCode.updateMany as jest.Mock).mockResolvedValue({
    count: 1,
  });
  (prisma.oAuthToken.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(person);
});
afterAll(() => {
  process.env = original;
});

describe("the id_token", () => {
  it("id_token verifies against the published jwks", async () => {
    const tokens = await exchange();
    if (!("id_token" in tokens)) throw new Error("no id_token");
    const { header, signingInput, signature } = decode(tokens.id_token);

    const response = await jwksGet();
    const { keys } = await response.json();
    expect(keys).toHaveLength(1);
    const jwk = keys.find((key: { kid: string }) => key.kid === header.kid);
    expect(jwk).toBeDefined();
    expect(jwk).toMatchObject({ kty: "RSA", alg: "RS256", use: "sig" });
    expect(jwk.kid).toBe(thumbprint(jwk));
    // Only the public half is published.
    for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(jwk).not.toHaveProperty(secret);
    }

    expect(header).toMatchObject({ alg: "RS256", typ: "JWT" });
    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    expect(
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(signingInput),
        publicKey,
        signature
      )
    ).toBe(true);
    // Another key's signature does not verify.
    const stranger = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    }).publicKey;
    expect(
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(signingInput),
        stranger,
        signature
      )
    ).toBe(false);
  });

  it("id_token carries nonce, aud needt-budget and email_verified false for an unconfirmed email", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...person,
      emailVerified: null,
    });
    const tokens = await exchange();
    if (!("id_token" in tokens)) throw new Error("no id_token");
    const { payload } = decode(tokens.id_token);

    expect(payload).toMatchObject({
      iss: ISSUER,
      sub: "user-1",
      aud: "needt-budget",
      nonce: "nonce-1",
      email: "Maksym@Example.com",
      email_verified: false,
      name: "Maksym",
      auth_time: Math.floor(AUTH_TIME.getTime() / 1000),
    });
    expect(payload.exp - payload.iat).toBe(300);
    expect(Math.abs(payload.iat - Date.now() / 1000)).toBeLessThan(10);
  });

  it("says email_verified true for a confirmed email, and leaves out what the scope did not ask for", async () => {
    (prisma.oAuthAuthorizationCode.findUnique as jest.Mock).mockResolvedValue(
      storedCode({ scope: "openid", nonce: null })
    );
    const tokens = await exchange();
    if (!("id_token" in tokens)) throw new Error("no id_token");
    const { payload } = decode(tokens.id_token);
    expect(payload.sub).toBe("user-1");
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("email_verified");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("nonce");

    (prisma.oAuthAuthorizationCode.findUnique as jest.Mock).mockResolvedValue(
      storedCode({ scope: "openid email" })
    );
    const withEmail = await exchange();
    if (!("id_token" in withEmail)) throw new Error("no id_token");
    expect(decode(withEmail.id_token).payload).toMatchObject({
      email_verified: true,
    });
  });
});

describe("the openid code exchange", () => {
  it("openid code exchange returns no refresh token", async () => {
    const tokens = await exchange();
    expect(tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
    });
    expect(tokens.access_token).toMatch(/^ndt_oat_/);
    expect(tokens).not.toHaveProperty("refresh_token");

    const { data } = (prisma.oAuthToken.createMany as jest.Mock).mock
      .calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      type: "access",
      resource: `${ISSUER}/oauth/userinfo`,
      scope: "openid email profile",
      familyId: "family-1",
      userId: "user-1",
    });
    expect(data[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(
      59 * 60 * 1000
    );
  });

  it("needs no resource, and a second use of the code is refused", async () => {
    await expect(
      exchange({ resource: "https://anything.example" })
    ).resolves.toBeDefined();
    (prisma.oAuthAuthorizationCode.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
    await expect(exchange()).rejects.toMatchObject({ error: "invalid_grant" });
    // A replayed code ends whatever it produced.
    expect(prisma.oAuthToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: "family-1", revokedAt: null },
      })
    );
  });

  it("refuses a wrong verifier and a different redirect_uri", async () => {
    await expect(
      exchange({ codeVerifier: "x".repeat(50) })
    ).rejects.toMatchObject({ error: "invalid_grant" });
    await expect(
      exchange({ redirectUri: "https://budget.needt.app/other" })
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it("will not turn an MCP code of a first-party client into an id_token", async () => {
    (prisma.oAuthAuthorizationCode.findUnique as jest.Mock).mockResolvedValue(
      storedCode({
        scope: "needt.read",
        resource: "https://mcp.needt.app/mcp",
      })
    );
    await expect(exchange()).rejects.toMatchObject({ error: "invalid_grant" });
  });
});

describe("userinfo", () => {
  const userinfo = (token?: string) =>
    userinfoGet(
      new NextRequest(`${ISSUER}/oauth/userinfo`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
    );
  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: "tok-1",
    type: "access",
    userId: "user-1",
    scope: "openid email profile",
    resource: `${ISSUER}/oauth/userinfo`,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: new Date(),
    client: { clientId: "needt-budget" },
    ...overrides,
  });

  it("userinfo returns the same sub for the oidc access token", async () => {
    const tokens = await exchange();
    if (!("id_token" in tokens)) throw new Error("no id_token");
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(stored());

    const response = await userinfo(tokens.access_token);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sub).toBe(decode(tokens.id_token).payload.sub);
    expect(body).toEqual({
      sub: "user-1",
      email: "Maksym@Example.com",
      email_verified: true,
      name: "Maksym",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("userinfo rejects an mcp access token", async () => {
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(
      stored({ resource: "https://mcp.needt.app/mcp", scope: "needt.read" })
    );
    const response = await userinfo("ndt_oat_mcp");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await response.json()).toMatchObject({ error: "invalid_token" });
  });

  it("rejects no token, an unknown token, a revoked token and an expired one", async () => {
    expect((await userinfo()).status).toBe(401);
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(null);
    expect((await userinfo("ndt_oat_nope")).status).toBe(401);
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(
      stored({ revokedAt: new Date() })
    );
    expect((await userinfo("ndt_oat_revoked")).status).toBe(401);
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(
      stored({ expiresAt: new Date(Date.now() - 1000) })
    );
    expect((await userinfo("ndt_oat_expired")).status).toBe(401);
  });

  it("an oidc access token does not open the MCP server", async () => {
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(stored());
    await expect(resolveAccessToken("ndt_oat_oidc")).resolves.toBeNull();
  });
});

describe("discovery", () => {
  it("discovery lists the endpoints and S256 only", async () => {
    const response = await discoveryGet();
    const doc = await response.json();
    expect(doc).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
      jwks_uri: `${ISSUER}/oauth/jwks`,
      end_session_endpoint: `${ISSUER}/oauth/logout`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      id_token_signing_alg_values_supported: ["RS256"],
      subject_types_supported: ["public"],
      token_endpoint_auth_methods_supported: ["none"],
      grant_types_supported: ["authorization_code"],
    });
    expect(doc.scopes_supported).toEqual(["openid", "email", "profile"]);
  });

  it("follows the configured issuer", async () => {
    process.env.OAUTH_ISSUER_URL = "https://staging.example";
    const doc = await (await discoveryGet()).json();
    expect(doc.issuer).toBe("https://staging.example");
    expect(doc.jwks_uri).toBe("https://staging.example/oauth/jwks");
  });
});

describe("without a signing key", () => {
  it("missing signing key fails openid requests with server_error and leaves mcp exchange working", async () => {
    delete process.env.OIDC_SIGNING_KEY;
    expect(await loadSigningKey()).toBeNull();

    // The openid exchange fails before the code is spent.
    const failure = await exchange().catch((error) => error);
    expect(failure).toBeInstanceOf(OAuthError);
    expect(failure).toMatchObject({ error: "server_error", status: 500 });
    expect(prisma.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled();

    // The JWKS endpoint says so too, instead of publishing an empty set.
    const jwks = await jwksGet();
    expect(jwks.status).toBe(503);

    // An MCP exchange never touches the key.
    (prisma.oAuthAuthorizationCode.findUnique as jest.Mock).mockResolvedValue(
      storedCode({
        scope: "needt.read",
        resource: "https://mcp.needt.app/mcp",
        nonce: null,
        authTime: null,
      })
    );
    const mcp = await exchangeAuthorizationCode({
      code: "ndt_oac_code",
      clientDbId: "client-db-1",
      redirectUri: REDIRECT,
      codeVerifier: verifier,
      resource: "https://mcp.needt.app/mcp",
    });
    expect(mcp).toMatchObject({ scope: "needt.read" });
    expect(mcp).toHaveProperty("refresh_token");
    expect(mcp).not.toHaveProperty("id_token");
  });

  it("refuses a key that is not a usable RSA key", async () => {
    process.env.OIDC_SIGNING_KEY =
      "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----";
    expect(await loadSigningKey()).toBeNull();
    process.env.OIDC_SIGNING_KEY = crypto
      .generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(await loadSigningKey()).toBeNull();
  });

  it("reads a key whose newlines were flattened into \\n by an env file", async () => {
    process.env.OIDC_SIGNING_KEY = newPem().trim().replace(/\n/g, "\\n");
    expect(await loadSigningKey()).not.toBeNull();
  });
});
