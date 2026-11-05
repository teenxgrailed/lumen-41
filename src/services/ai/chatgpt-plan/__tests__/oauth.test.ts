import crypto from "crypto";

import { prisma } from "@/lib/prisma";

import { createPkceChallenge } from "../../oauth";
import {
  buildChatGptPlanAuthorizationUrl,
  getChatGptPlanAccessToken,
  nonceFromState,
  parseTokenResponse,
  resetJwksCache,
  safeDecrypt,
  verifyChatGptIdToken,
} from "../oauth";

const tx = {
  $queryRaw: jest.fn(),
  aIOAuthConnection: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};
jest.mock("@/lib/prisma", () => ({
  prisma: {
    aIOAuthConnection: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  },
}));
jest.mock("@/lib/feature-flags", () => ({
  chatGptPlanFlagEnabled: jest.fn(),
}));
jest.mock("../../encryption", () => ({
  encryptSecret: (v: string) => `enc(${v})`,
  decryptSecret: (v: string | null) => {
    if (v === "corrupt") throw new Error("bad ciphertext");
    return v ? v.replace(/^enc\((.*)\)$/, "$1") : null;
  },
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
  it.each(["HS256", "none"])("rejects alg %s", async (alg) => {
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = enc({ alg, kid: "k1" });
    const body = enc(good());
    const secret = Buffer.from(JSON.stringify(jwk));
    const sig =
      alg === "none"
        ? ""
        : crypto
            .createHmac("sha256", secret)
            .update(`${head}.${body}`)
            .digest("base64url");
    await expect(
      verifyChatGptIdToken(`${head}.${body}.${sig}`, expected, [jwk])
    ).rejects.toThrow();
  });
  it("rejects a forged signature", async () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(
      verifyChatGptIdToken(sign(good(), other.privateKey), expected, [jwk])
    ).rejects.toThrow();
  });
});

const DO_NOT_FAKE = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
];

describe("JWKS rotation", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const newKey = { ...publicKey.export({ format: "jwk" }), kid: "k2" };
  const oldKey = {
    ...crypto
      .generateKeyPairSync("rsa", { modulusLength: 2048 })
      .publicKey.export({ format: "jwk" }),
    kid: "k1",
  };
  function token() {
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = enc({ alg: "RS256", kid: "k2" });
    const body = enc({
      iss: "https://auth.openai.com",
      aud: "client-1",
      exp: Math.floor(Date.now() / 1000) + 600,
      sub: "sub-1",
      nonce: "n1",
    });
    const sig = crypto
      .sign("RSA-SHA256", Buffer.from(`${head}.${body}`), privateKey)
      .toString("base64url");
    return `${head}.${body}.${sig}`;
  }
  function discovery(keys: unknown[]) {
    const reply = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200 });
    global.fetch = jest.fn(async (url: string | URL | Request) =>
      String(url).includes("openid-configuration")
        ? reply({
            issuer: "https://auth.openai.com",
            jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
          })
        : reply({ keys })
    ) as unknown as typeof fetch;
  }
  beforeEach(() => resetJwksCache());

  const keyFetches = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("jwks")
    ).length;
  const check = () =>
    verifyChatGptIdToken(token(), { clientId: "client-1", nonce: "n1" });

  afterEach(() => jest.useRealTimers());

  it("refetches once on an unknown kid in a cached set, after the window", async () => {
    jest.useFakeTimers({ doNotFake: DO_NOT_FAKE as never, now: new Date() });
    discovery([oldKey]);
    // The first load is fresh, so an unknown kid there is not a rotation.
    await expect(check()).rejects.toThrow();
    expect(keyFetches()).toBe(1);

    jest.setSystemTime(Date.now() + 2 * 60 * 1000);
    discovery([oldKey, newKey]);
    await expect(check()).resolves.toMatchObject({ subject: "sub-1" });
    expect(keyFetches()).toBe(1);
  });

  it("does not refetch again within a minute for a kid that stays unknown", async () => {
    jest.useFakeTimers({ doNotFake: DO_NOT_FAKE as never, now: new Date() });
    discovery([oldKey]);
    await expect(check()).rejects.toThrow();
    await expect(check()).rejects.toThrow();
    await expect(check()).rejects.toThrow();
    expect(keyFetches()).toBe(1);
  });
});

describe("safeDecrypt", () => {
  it("reads a damaged secret as absent instead of throwing", () => {
    expect(safeDecrypt("corrupt")).toBeNull();
    expect(safeDecrypt("enc(x)")).toBe("x");
    expect(safeDecrypt(null)).toBeNull();
  });
});

describe("refresh", () => {
  const prev = process.env.OPENAI_SIWC_CLIENT_ID;
  beforeEach(() => {
    process.env.OPENAI_SIWC_CLIENT_ID = "client-1";
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ locked: true }]);
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (t: unknown) => unknown) => fn(tx)
    );
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
    expect(tx.$queryRaw).toHaveBeenCalled();
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

  it("saves the rotated tokens again when the commit fails after OpenAI rotated", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(row());
    tokenReply({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
    // The work runs, then the commit itself fails.
    (prisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: (t: unknown) => unknown) => {
        await fn(tx);
        throw new Error("commit failed");
      }
    );
    const result = await getChatGptPlanAccessToken("u1");
    expect(result).toMatchObject({ ok: true, accessToken: "new-access" });
    const retry = (prisma.aIOAuthConnection.updateMany as jest.Mock).mock
      .calls[0][0];
    // Only if the row still holds the token we rotated away from.
    expect(retry.where).toEqual({
      id: "c1",
      encryptedRefreshToken: "enc(old-refresh)",
    });
    expect(retry.data).toMatchObject({
      encryptedAccessToken: "enc(new-access)",
      encryptedRefreshToken: "enc(new-refresh)",
    });
  });

  it("still returns the access token when the second save fails too", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(row());
    tokenReply({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
    (prisma.$transaction as jest.Mock).mockImplementationOnce(
      async (fn: (t: unknown) => unknown) => {
        await fn(tx);
        throw new Error("commit failed");
      }
    );
    (prisma.aIOAuthConnection.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error("db down")
    );
    await expect(getChatGptPlanAccessToken("u1")).resolves.toMatchObject({
      ok: true,
      accessToken: "new-access",
    });
  });

  it("polls for the lock instead of waiting inside the transaction", async () => {
    findUnique.mockResolvedValue(row());
    tx.aIOAuthConnection.findUnique.mockResolvedValue(
      row({
        encryptedAccessToken: "enc(their-access)",
        encryptedRefreshToken: "enc(their-refresh)",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    );
    tx.$queryRaw
      .mockResolvedValueOnce([{ locked: false }])
      .mockResolvedValueOnce([{ locked: true }]);
    global.fetch = jest.fn();
    await expect(getChatGptPlanAccessToken("u1")).resolves.toMatchObject({
      ok: true,
      accessToken: "their-access",
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.aIOAuthConnection.findUnique).toHaveBeenCalledTimes(1);
    const options = (prisma.$transaction as jest.Mock).mock.calls[0][1];
    expect(options.timeout).toBeGreaterThan(10_000);
  });

  it("treats an undecryptable refresh token as revoked and clears it", async () => {
    findUnique.mockResolvedValue(row({ encryptedRefreshToken: "corrupt" }));
    tx.aIOAuthConnection.findUnique.mockResolvedValue(
      row({ encryptedRefreshToken: "corrupt" })
    );
    await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
    expect(tx.aIOAuthConnection.delete).toHaveBeenCalled();
  });

  it("falls back to a refresh when the stored access token cannot be decrypted", async () => {
    findUnique.mockResolvedValue(
      row({
        encryptedAccessToken: "corrupt",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    );
    tx.aIOAuthConnection.findUnique.mockResolvedValue(
      row({
        encryptedAccessToken: "corrupt",
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    );
    tokenReply({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });
    await expect(getChatGptPlanAccessToken("u1")).resolves.toMatchObject({
      ok: true,
      accessToken: "new-access",
    });
  });

  it("is not connected without the client id", async () => {
    delete process.env.OPENAI_SIWC_CLIENT_ID;
    await expect(getChatGptPlanAccessToken("u1")).resolves.toEqual({
      ok: false,
      reason: "not_connected",
    });
  });
});
