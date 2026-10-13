import type { SystemSettings } from "@prisma/client";

import {
  decryptOptionalSecret,
  encryptSecret,
} from "@/lib/security/secret-encryption";

/**
 * The one place SystemSettings secrets cross between the database and the
 * code that uses them. The OAuth client secrets and the Resend API key are
 * stored encrypted (`enc:v1:`); rows written before encryption are still read
 * as plaintext until the provider-secrets backfill reaches them.
 *
 * Writes go through `sealSystemSettingsSecrets`; anything that hands a secret
 * to a sign-in provider or Resend reads it through `openSystemSettingsSecrets`.
 * API responses never carry the value either way: they show
 * `SECRET_MASK` (see `@/lib/api/public-records`).
 */

export const SYSTEM_SETTINGS_SECRET_FIELDS = [
  "googleClientSecret",
  "outlookClientSecret",
  "resendApiKey",
  "applePrivateKey",
  "githubClientSecret",
  "discordClientSecret",
  "twitterClientSecret",
  "linkedinClientSecret",
  "openaiSiwcClientSecret",
] as const satisfies ReadonlyArray<keyof SystemSettings>;

type SecretField = (typeof SYSTEM_SETTINGS_SECRET_FIELDS)[number];
type SecretFields = Partial<Record<SecretField, string | null>>;

/** Returns a copy whose secret fields are decrypted. */
export function openSystemSettingsSecrets<T extends SecretFields>(
  settings: T
): T {
  const opened: SecretFields = { ...settings };
  for (const field of SYSTEM_SETTINGS_SECRET_FIELDS) {
    if (field in settings) {
      opened[field] = decryptOptionalSecret(settings[field]) ?? null;
    }
  }
  return opened as T;
}

/**
 * Encrypts the secret fields of a write payload. An empty string stays empty
 * so "cleared" and "not set" keep meaning the same thing they did before.
 */
export function sealSystemSettingsSecrets<T extends Record<string, unknown>>(
  data: T
): T {
  const sealed: Record<string, unknown> = { ...data };
  for (const field of SYSTEM_SETTINGS_SECRET_FIELDS) {
    const value = sealed[field];
    if (typeof value === "string" && value !== "") {
      sealed[field] = encryptSecret(value);
    }
  }
  return sealed as T;
}
