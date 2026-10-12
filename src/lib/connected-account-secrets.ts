import {
  decryptOptionalSecret,
  decryptSecret,
  encryptOptionalSecret,
  encryptSecret,
} from "@/lib/security/secret-encryption";

/**
 * The one place ConnectedAccount credentials cross between the database and
 * provider code. `accessToken` holds the OAuth access token for Google and
 * Outlook and the account password for CalDAV; `refreshToken` the OAuth
 * refresh token. Both are stored encrypted (`enc:v1:`), and rows written
 * before encryption are still read as plaintext until the backfill reaches
 * them.
 *
 * Writes go through `sealConnectedAccountTokens`; anything that hands a row to
 * provider code goes through `openConnectedAccountTokens` first.
 */

interface StoredTokenFields {
  accessToken: string;
  refreshToken?: string | null;
}

/** Returns a copy whose token fields are decrypted. */
export function openConnectedAccountTokens<T extends StoredTokenFields>(
  account: T
): T {
  return {
    ...account,
    accessToken: decryptSecret(account.accessToken),
    refreshToken: decryptOptionalSecret(account.refreshToken),
  };
}

/** Encrypts the token fields of a Prisma write payload. */
export function sealConnectedAccountTokens<
  T extends { accessToken?: string; refreshToken?: string | null },
>(data: T): T {
  return {
    ...data,
    ...(data.accessToken !== undefined
      ? { accessToken: encryptSecret(data.accessToken) }
      : {}),
    ...(data.refreshToken !== undefined
      ? { refreshToken: encryptOptionalSecret(data.refreshToken) }
      : {}),
  };
}
