import crypto from "crypto";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "SecretEncryption";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
// GCM accepts shorter tags unless told otherwise, which would let a forged
// truncated tag through. Every value ever written used 16 bytes.
const AUTH_TAG_LENGTH = 16;

// DO NOT rename this literal. It is the key-derivation fallback for
// AES-256-GCM: development databases created without AI_ENCRYPTION_KEY or
// NEXTAUTH_SECRET hold AI keys and IMAP credentials encrypted under a key
// derived from this exact string. It is never used in production.
const LEGACY_DEVELOPMENT_FALLBACK_SECRET = "flowday-local-ai-secret";

/**
 * Marks a value written by `encryptSecret`. Provider tokens and passwords were
 * stored as plaintext before this format existed, so the marker is what lets
 * a reader tell the two apart while old rows are still being backfilled. The
 * version leaves room for a future key or algorithm change.
 */
export const ENCRYPTED_SECRET_PREFIX = "enc:v1:";

let warnedAboutDevelopmentFallback = false;

export class SecretEncryptionKeyMissingError extends Error {
  constructor() {
    super(
      "AI_ENCRYPTION_KEY (or NEXTAUTH_SECRET) must be set in production to encrypt stored credentials."
    );
    this.name = "SecretEncryptionKeyMissingError";
  }
}

function configuredSecret(): string | null {
  return process.env.AI_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || null;
}

/**
 * Throws in production when no real key is configured. Called at process
 * start so a misconfigured deployment fails loudly instead of the first time
 * someone connects a calendar.
 */
export function assertSecretEncryptionKeyConfigured(): void {
  if (process.env.NODE_ENV === "production" && !configuredSecret()) {
    throw new SecretEncryptionKeyMissingError();
  }
}

/**
 * The AES-256 key shared by every stored secret (AI keys, IMAP credentials,
 * provider OAuth tokens, CalDAV passwords). The derivation - sha256 of
 * AI_ENCRYPTION_KEY, else NEXTAUTH_SECRET - must not change, or existing
 * ciphertext becomes unreadable.
 */
export function getSecretEncryptionKey(): Buffer {
  const secret = configuredSecret();
  if (secret) {
    return crypto.createHash("sha256").update(secret).digest();
  }

  if (process.env.NODE_ENV === "production") {
    throw new SecretEncryptionKeyMissingError();
  }

  if (!warnedAboutDevelopmentFallback && process.env.NODE_ENV !== "test") {
    warnedAboutDevelopmentFallback = true;
    void logger.warn(
      "AI_ENCRYPTION_KEY is not set; using the development-only fallback key",
      {},
      LOG_SOURCE
    );
  }

  return crypto
    .createHash("sha256")
    .update(LEGACY_DEVELOPMENT_FALLBACK_SECRET)
    .digest();
}

/** AES-256-GCM as `iv.tag.ciphertext`, each part base64url, no prefix. */
export function sealWithSecretKey(value: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    getSecretEncryptionKey(),
    iv,
    {
      authTagLength: AUTH_TAG_LENGTH,
    }
  );
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

/** Inverse of `sealWithSecretKey`; null when the value is not three parts. */
export function openWithSecretKey(value: string): string | null {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));

  if (!iv || !tag || !encrypted) return null;
  if (tag.length !== AUTH_TAG_LENGTH) return null;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getSecretEncryptionKey(),
    iv,
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

/** Encrypts a credential for storage. Already-encrypted input is kept as is. */
export function encryptSecret(value: string): string {
  if (isEncryptedSecret(value)) return value;
  return `${ENCRYPTED_SECRET_PREFIX}${sealWithSecretKey(value)}`;
}

/**
 * Reads a stored credential. A value without the prefix is a row written
 * before encryption existed and is returned unchanged; the backfill encrypts
 * those rows. A prefixed value that cannot be decrypted throws, because
 * sending ciphertext to a provider as a password would only fail later and
 * less clearly. The error never contains the value.
 */
export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value;

  let opened: string | null;
  try {
    opened = openWithSecretKey(value.slice(ENCRYPTED_SECRET_PREFIX.length));
  } catch {
    opened = null;
  }
  if (opened === null) {
    throw new Error(
      "Stored credential could not be decrypted with the configured key"
    );
  }
  return opened;
}

export function encryptOptionalSecret<T extends string | null | undefined>(
  value: T
): T | string {
  return typeof value === "string" ? encryptSecret(value) : value;
}

export function decryptOptionalSecret<T extends string | null | undefined>(
  value: T
): T | string {
  return typeof value === "string" ? decryptSecret(value) : value;
}
