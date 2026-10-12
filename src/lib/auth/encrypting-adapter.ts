import type { NextAuthOptions } from "next-auth";

import { encryptOptionalSecret } from "@/lib/security/secret-encryption";

type AuthAdapter = NonNullable<NextAuthOptions["adapter"]>;
type LinkAccount = NonNullable<AuthAdapter["linkAccount"]>;
type LinkedAccount = Parameters<LinkAccount>[0];

/**
 * NextAuth's Prisma adapter writes the sign-in provider's OAuth tokens to
 * `Account.access_token` / `Account.refresh_token` verbatim. Nothing in Needt
 * reads them back (calendar and mail access use ConnectedAccount), so they
 * are encrypted on the way in. `id_token` is left alone: for the credentials
 * provider that column holds the bcrypt password hash, and the credentials
 * provider never goes through `linkAccount` anyway.
 */
export function withEncryptedAccountTokens(adapter: AuthAdapter): AuthAdapter {
  const linkAccount = adapter?.linkAccount;
  if (!linkAccount) return adapter;

  return {
    ...adapter,
    linkAccount: ((account: LinkedAccount) =>
      (linkAccount as (value: LinkedAccount) => unknown)({
        ...account,
        access_token: encryptOptionalSecret(account.access_token),
        refresh_token: encryptOptionalSecret(account.refresh_token),
      })) as LinkAccount,
  };
}
