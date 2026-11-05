import crypto from "crypto";

import { prisma } from "@/lib/prisma";

import { createPkceChallenge } from "../../oauth";
import {
  buildChatGptPlanAuthorizationUrl,
  getChatGptPlanAccessToken,
  nonceFromState,
  parseTokenResponse,
  verifyChatGptIdToken,
} from "../oauth";

const tx = {
  $executeRaw: jest.fn(),
  aIOAuthConnection: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};
jest.mock("@/lib/prisma", () => ({
  prisma: {
    aIOAuthConnection: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  },
}));
jest.mock("@/lib/feature-flags", () => ({
  chatGptPlanFlagEnabled: jest.fn(),
}));
jest.mock("../../encryption", () => ({
  encryptSecret: (v: string) => `enc(${v})`,
  decryptSecret: (v: string | null) =>
    v ? v.replace(/^enc\((.*)\)$/, "$1") : null,
}));

const config = { clientId: "client-1" };
const findUnique = prisma.aIOAuthConnection.findUnique as jest.Mock;

function row(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: "u1",
    encryptedAccessToken: "enc(old-access)",
    encryptedRefreshToken: "enc(old-refresh)",
    scope: "openid offline_access chatgpt.tokens.use.direct",
    expiresAt: new Date(Date.now() - 1000),
    ...over,
  };
}

function tokenReply(body: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("authorization URL", () => {
  it("carries PKCE S256, resource, state, nonce and the plan scope", () => {
    const url = new URL(
      buildChatGptPlanAuthorizationUrl({
        config,
        redirectUri: "https://app.needt.app/api/ai/chatgpt-plan/callback",
        state: "state-1",
        codeVerifier: "verifier-1",
      })
    );
    expect(url.origin + url.pathname).toBe(
      "https://auth.openai.com/api/accounts/authorize"
    );
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("resource")).toBe("https://api.openai.com/v1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createPkceChallenge("verifier-1")
    );
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("nonce")).toBe(nonceFromState("state-1"));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "offline_access",
        "resource.invoke",
        "chatgpt.tokens.use.direct",
      ])
    );
  });

  it("derives a different nonce per state", () => {
    expect(nonceFromState("a")).not.toBe(nonceFromState("b"));
    expect(nonceFromState("a")).not.toBe("a");
  });
});

describe("parseTokenResponse", () => {
  it("requires a refresh token when offline_access is granted", () => {
    expect(() =>
      parseTokenResponse({
        access_token: "a",
        expires_in: 3600,
        scope: "offline_access",
      })
    ).toThrow();
  });
  it("keeps the previous scope when a refresh omits it", () => {
    const t = parseTokenResponse(
      { access_token: "a", expires_in: 3600, refresh_token: "r" },
      "openid offline_access"
    );
    expect(t.scope).toBe("openid offline_access");
  });
});

describe("ID token check", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };

  function sign(claims: Record<string, unknown>, key = privateKey) {
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = enc({ alg: "RS256", kid: "k1" });
    const body = enc(claims);
    const sig = crypto
      .sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key)
      .toString("base64url");
    return `${head}.${body}.${sig}`;
  }
  const good = () => ({
    iss: "https://auth.openai.com",
    aud: "client-1",
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "sub-1",
    nonce: "n1",
    email: "a@b.c",
  });
  const expected = { clientId: "client-1", nonce: "n1" };

  it("accepts a valid token", async () => {
    await expect(
      verifyChatGptIdToken(sign(good()), expected, [jwk])
    ).resolves.toEqual({ subject: "sub-1", email: "a@b.c" });
  });
  it.each([
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "other" }],
    ["nonce", { nonce: "n2" }],
    ["expiry", { exp: 1 }],
  ])("rejects a wrong %s", async (_n, over) => {
    await expect(
      verifyChatGptIdToken(sign({ ...good(), ...over }), expected, [jwk])
    ).rejects.toThrow();
  });
  it("rejects a forged signature", async () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(
      verifyChatGptIdToken(sign(good(), other.privateKey), expected, [jwk])
    ).rejects.toThrow();
  });
});

describe("refresh", () => {
  const prev = process.env.OPENAI_SIWC_CLIENT_ID;
  beforeEach(() => {
    process.env.OPENAI_SIWC_CLIENT_ID = "client-1";
    jest.clearAllMocks();
  });
  afterAll(() => {
    process.env.OPENAI_SIWC_CLIENT_ID = prev;
  });

  it("returns the stored token while it is fresh, with no refresh", async () => {
    findUnique.mockResolvedValue(
      row({ expiresAt: new Date(Date.now() + 3_600_000) })
    );
    global.fetch = jest.fn();
    await expect(getChatGptPlanAccessToken("u1")).resolves.toMatchObject({
      ok: true,
      accessToken: "old-access",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refreshes under the lock and stores the rotated refresh token", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(row());
    tokenReply({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
    const result = await getChatGptPlanAccessToken("u1");
    expect(result).toMatchObject({ ok: true, accessToken: "new-access" });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.aIOAuthConnection.update.mock.calls[0][0].data).toMatchObject({
      encryptedAccessToken: "enc(new-access)",
      encryptedRefreshToken: "enc(new-refresh)",
    });
    const sent = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    expect(sent).toContain("grant_type=refresh_token");
    expect(sent).toContain("resource=https%3A%2F%2Fapi.openai.com%2Fv1");
    expect(sent).not.toContain("scope=");
  });

  it("uses the winner's token when another process refreshed first", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(
      row({
        encryptedAccessToken: "enc(their-access)",
        encryptedRefreshToken: "enc(their-refresh)",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    );
    global.fetch = jest.fn();
    await expect(getChatGptPlanAccessToken("u1")).resolves.toMatchObject({
      accessToken: "their-access",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["invalid_grant", "refresh_token_reused", "refresh_token_expired"])(
    "deletes the connection on %s",
    async (code) => {
      findUnique.mockResolvedValue(row());
      tx.aIOAuthConnection.findUnique.mockResolvedValue(row());
      tokenReply({ error: code }, 400);
      await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
        ok: false,
        reason: "revoked",
      });
      expect(tx.aIOAuthConnection.delete).toHaveBeenCalled();
    }
  );

  it("keeps the connection on a 5xx or a network failure", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(row());
    tokenReply({ error: "server_error" }, 503);
    await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("down"));
    await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(tx.aIOAuthConnection.delete).not.toHaveBeenCalled();
  });

  it("is not connected without the client id", async () => {
    delete process.env.OPENAI_SIWC_CLIENT_ID;
    await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "not_connected",
    });
  });
});
