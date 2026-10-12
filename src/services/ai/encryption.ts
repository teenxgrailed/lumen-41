import {
  openWithSecretKey,
  sealWithSecretKey,
} from "@/lib/security/secret-encryption";

// AI keys, AI OAuth tokens and IMAP credentials use the original unprefixed
// `iv.tag.ciphertext` format. Existing rows depend on it, so it stays as is;
// the key derivation is shared with provider secrets in
// `@/lib/security/secret-encryption`, which also refuses to run in production
// without a configured key.

export function encryptSecret(value: string): string {
  return sealWithSecretKey(value);
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return openWithSecretKey(value);
}
