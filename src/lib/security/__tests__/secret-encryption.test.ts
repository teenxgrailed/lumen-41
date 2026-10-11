import {
  decryptSecret as decryptLegacyAiSecret,
  encryptSecret as encryptLegacyAiSecret,
} from "@/services/ai/encryption";
import crypto from "crypto";

import {
  openConnectedAccountTokens,
  sealConnectedAccountTokens,
} from "@/lib/connected-account-secrets";
import {
  ENCRYPTED_SECRET_PREFIX,
  SecretEncryptionKeyMissingError,
  assertSecretEncryptionKeyConfigured,
  decryptOptionalSecret,
  decryptSecret,
  encryptOptionalSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const ORIGINAL_ENV = { ...process.env };

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    setEnv({ AI_ENCRYPTION_KEY: "test-key", NEXTAUTH_SECRET: undefined });
  });

  it("round-trips and marks the value with the versioned prefix", () => {
    const stored = encryptSecret("ya29.a0-google-access-token");
    expect(stored.startsWith(ENCRYPTED_SECRET_PREFIX)).toBe(true);
    expect(stored).not.toContain("ya29");
    expect(decryptSecret(stored)).toBe("ya29.a0-google-access-token");
  });

  it("uses a fresh IV for every write", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("round-trips the empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("returns legacy plaintext unchanged, including dotted JWT-shaped tokens", () => {
    expect(decryptSecret("plain-caldav-password")).toBe(
      "plain-caldav-password"
    );
    expect(decryptSecret("eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl")).toBe(
      "eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl"
    );
  });

  it("does not double-encrypt", () => {
    const once = encryptSecret("token");
    expect(encryptSecret(once)).toBe(once);
  });

  it("handles null and undefined in the optional variants", () => {
    expect(encryptOptionalSecret(null)).toBeNull();
    expect(encryptOptionalSecret(undefined)).toBeUndefined();
    expect(decryptOptionalSecret(null)).toBeNull();
    expect(decryptOptionalSecret(encryptOptionalSecret("x"))).toBe("x");
  });

  it("throws without echoing the value when the key is wrong", () => {
    const stored = encryptSecret("super-secret-value");
    setEnv({ AI_ENCRYPTION_KEY: "another-key" });
    expect(() => decryptSecret(stored)).toThrow(/could not be decrypted/);
    try {
      decryptSecret(stored);
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-value");
      expect(String(error)).not.toContain(stored);
    }
  });

  it("detects encrypted values", () => {
    expect(isEncryptedSecret(encryptSecret("a"))).toBe(true);
    expect(isEncryptedSecret("a")).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
  });
});

describe("key configuration", () => {
  it("refuses to encrypt in production without a key", () => {
    setEnv({
      NODE_ENV: "production",
      AI_ENCRYPTION_KEY: undefined,
      NEXTAUTH_SECRET: undefined,
    });
    expect(() => encryptSecret("x")).toThrow(SecretEncryptionKeyMissingError);
    expect(() => assertSecretEncryptionKeyConfigured()).toThrow(
      SecretEncryptionKeyMissingError
    );
    expect(() => encryptLegacyAiSecret("x")).toThrow(
      SecretEncryptionKeyMissingError
    );
  });

  it("accepts NEXTAUTH_SECRET as the production key", () => {
    setEnv({
      NODE_ENV: "production",
      AI_ENCRYPTION_KEY: undefined,
      NEXTAUTH_SECRET: "auth-secret",
    });
    expect(() => assertSecretEncryptionKeyConfigured()).not.toThrow();
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });

  it("falls back to the development key outside production", () => {
    setEnv({
      NODE_ENV: "development",
      AI_ENCRYPTION_KEY: undefined,
      NEXTAUTH_SECRET: undefined,
    });
    expect(() => assertSecretEncryptionKeyConfigured()).not.toThrow();
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });
});

describe("existing AI / IMAP ciphertext", () => {
  it("still decrypts values sealed with the original derivation", () => {
    setEnv({ AI_ENCRYPTION_KEY: "prod-key" });
    // Reproduce the pre-change encryptSecret byte for byte.
    const key = crypto.createHash("sha256").update("prod-key").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update("sk-ant-legacy", "utf8"),
      cipher.final(),
    ]);
    const stored = [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString("base64url"))
      .join(".");

    expect(decryptLegacyAiSecret(stored)).toBe("sk-ant-legacy");
    expect(decryptLegacyAiSecret(encryptLegacyAiSecret("imap-pass"))).toBe(
      "imap-pass"
    );
  });
});

describe("ConnectedAccount token helpers", () => {
  beforeEach(() => setEnv({ AI_ENCRYPTION_KEY: "test-key" }));

  it("seals only the fields present and opens both encrypted and legacy rows", () => {
    const sealed = sealConnectedAccountTokens({
      accessToken: "access",
      refreshToken: null,
      expiresAt: new Date(0),
    });
    expect(isEncryptedSecret(sealed.accessToken)).toBe(true);
    expect(sealed.refreshToken).toBeNull();
    expect(
      "refreshToken" in sealConnectedAccountTokens({ accessToken: "a" })
    ).toBe(false);

    expect(
      openConnectedAccountTokens({
        id: "1",
        accessToken: sealed.accessToken,
        refreshToken: encryptSecret("refresh"),
      })
    ).toEqual({ id: "1", accessToken: "access", refreshToken: "refresh" });
    expect(
      openConnectedAccountTokens({
        id: "2",
        accessToken: "legacy-password",
        refreshToken: null,
      })
    ).toEqual({ id: "2", accessToken: "legacy-password", refreshToken: null });
  });
});
