import { createSign, generateKeyPairSync } from "node:crypto";

import {
  GoogleIdTokenError,
  type GoogleIdTokenFailure,
  verifyGoogleIdToken,
} from "@/lib/auth/google-id-token";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";
const NOW_MS = Date.UTC(2026, 10, 14, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "key-1" };
const keys = async () => [jwk];

const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function token(
  claims: Record<string, unknown> = {},
  options: { key?: typeof pair.privateKey; header?: object } = {}
) {
  const header = b64({ alg: "RS256", kid: "key-1", ...options.header });
  const payload = b64({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-1",
    email: "Person@Example.com",
    email_verified: true,
    nonce: "n1",
    name: "Person",
    iat: NOW_S - 10,
    exp: NOW_S + 3000,
    ...claims,
  });
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(options.key ?? pair.privateKey)
    .toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const verify = (credential: unknown) =>
  verifyGoogleIdToken(credential, {
    clientId: CLIENT_ID,
    keys,
    nowMs: NOW_MS,
    nonce: "n1",
  });

async function reasonOf(credential: unknown): Promise<GoogleIdTokenFailure> {
  try {
    await verify(credential);
  } catch (error) {
    if (error instanceof GoogleIdTokenError) return error.reason;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("verifyGoogleIdToken", () => {
  it("accepts a good token and lower-cases the email", async () => {
    await expect(verify(token())).resolves.toEqual({
      sub: "google-sub-1",
      email: "person@example.com",
      name: "Person",
      picture: null,
      hd: null,
      issuedAtMs: (NOW_S - 10) * 1000,
    });
  });

  it("accepts the bare accounts.google.com issuer", async () => {
    await expect(
      verify(token({ iss: "accounts.google.com" }))
    ).resolves.toMatchObject({ sub: "google-sub-1" });
  });

  it("refuses a token minted for another client id", async () => {
    expect(await reasonOf(token({ aud: "someone-else.apps" }))).toBe(
      "audience"
    );
  });

  it("refuses an expired token", async () => {
    expect(await reasonOf(token({ exp: NOW_S - 600 }))).toBe("expired");
  });

  it("refuses a token without our nonce, or with another one", async () => {
    expect(await reasonOf(token({ nonce: "someone-elses" }))).toBe("nonce");
    expect(await reasonOf(token({ nonce: undefined }))).toBe("nonce");
    await expect(
      verifyGoogleIdToken(token(), {
        clientId: CLIENT_ID,
        keys,
        nowMs: NOW_MS,
        nonce: "",
      })
    ).rejects.toMatchObject({ reason: "nonce" });
  });

  it("reports hd, and asks for the keys again once on an unknown kid", async () => {
    const source = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([jwk]);
    await expect(
      verifyGoogleIdToken(token({ hd: "corp.example" }), {
        clientId: CLIENT_ID,
        keys: source,
        nowMs: NOW_MS,
        nonce: "n1",
      })
    ).resolves.toMatchObject({ hd: "corp.example" });
    expect(source).toHaveBeenNthCalledWith(2, { force: true });
  });

  it("refuses an address Google has not verified", async () => {
    expect(await reasonOf(token({ email_verified: false }))).toBe(
      "email-unverified"
    );
    expect(await reasonOf(token({ email_verified: undefined }))).toBe(
      "email-unverified"
    );
  });

  it("refuses another issuer", async () => {
    expect(await reasonOf(token({ iss: "https://evil.example" }))).toBe(
      "issuer"
    );
  });

  it("refuses a token signed with a key Google does not publish", async () => {
    expect(await reasonOf(token({}, { key: other.privateKey }))).toBe(
      "signature"
    );
  });

  it("refuses an unknown key id, a non-RS256 token and junk", async () => {
    expect(await reasonOf(token({}, { header: { kid: "nope" } }))).toBe(
      "unknown-key"
    );
    expect(await reasonOf(token({}, { header: { alg: "none" } }))).toBe(
      "algorithm"
    );
    expect(await reasonOf("not.a.token")).toBe("malformed");
    expect(await reasonOf(undefined)).toBe("malformed");
  });

  it("refuses a token without an account id", async () => {
    expect(await reasonOf(token({ sub: "" }))).toBe("incomplete");
  });
});
