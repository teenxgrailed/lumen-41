import { decryptSecret as openLegacySecret } from "@/services/ai/encryption";

import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

/**
 * The source token an import run carries while it is queued or running.
 * New runs store it in the `enc:v1:` format every provider secret uses.
 */
export function sealImportToken(token: string): string {
  return encryptSecret(token);
}

/**
 * Reads a stored import token. Runs queued before the switch to `enc:v1:`
 * hold the unprefixed `iv.tag.ciphertext` form from `@/services/ai/encryption`;
 * both are opened with the same key, so a run in flight across a deploy still
 * reaches its source. Null when there is nothing usable to send.
 */
export function openImportToken(
  stored: string | null | undefined
): string | null {
  if (!stored) return null;
  if (isEncryptedSecret(stored)) return decryptSecret(stored);
  return openLegacySecret(stored);
}
