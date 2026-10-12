import type { NextAuthOptions } from "next-auth";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AccountLinking";

/**
 * Where a sign-in goes when it would take over an account it cannot prove it
 * owns: the sign-in page with NextAuth's own "sign in the way you did before"
 * message (see `oauth-error.ts`).
 */
export const LINK_REFUSED_REDIRECT = "/auth/signin?error=OAuthAccountNotLinked";
const LINK_FAILED_REDIRECT = "/auth/signin?error=OAuthCallback";

/**
 * Providers that never join an existing account. X does not vouch for an
 * email address at all, so an X sign-in can only ever be its own account.
 */
export const NEVER_LINK_PROVIDERS: ReadonlySet<string> = new Set(["twitter"]);

/** Microsoft's tenant for personal accounts (outlook.com, live.com, ...). */
const MICROSOFT_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

type Profile = Record<string, unknown> | undefined | null;

const isTrue = (value: unknown) => value === true || value === "true";

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

/**
 * The email address the provider itself vouches for, read from its raw
 * profile (ID-token claims or userinfo), or `null` when it does not vouch for
 * one. Only this address may ever join an existing account.
 *
 * - Google, Apple, LinkedIn (OIDC), ChatGPT (OpenAI OIDC): `email_verified`.
 *   Apple sends it as the string "true".
 * - GitHub: the primary AND verified address from `/user/emails`, which our
 *   GitHub provider puts in `verified_primary_email` (`sign-in-providers.ts`).
 *   The public profile email is never trusted.
 * - Discord: the account's `verified` flag.
 * - Microsoft: a work or school address only when the tenant verified the
 *   domain (`xms_edov`, an optional claim the app registration must request);
 *   a personal Microsoft account's address is Microsoft's own sign-in name.
 * - X and anything unknown: never.
 */
export function verifiedProviderEmail(
  provider: string,
  profile: Profile
): string | null {
  if (!profile) return null;
  switch (provider) {
    case "google":
    case "apple":
    case "linkedin":
    case "openai":
      return isTrue(profile.email_verified)
        ? normalizeEmail(profile.email)
        : null;
    case "github":
      return normalizeEmail(profile.verified_primary_email);
    case "discord":
      return profile.verified === true ? normalizeEmail(profile.email) : null;
    case "azure-ad":
      return isTrue(profile.xms_edov) ||
        profile.tid === MICROSOFT_CONSUMER_TENANT
        ? normalizeEmail(profile.email)
        : null;
    default:
      return null;
  }
}

/** Whatever address the provider sent, verified or not. */
export function rawProviderEmail(provider: string, profile: Profile) {
  if (!profile) return null;
  return normalizeEmail(profile.email);
}

/**
 * The NextAuth `signIn` decision for joining an existing account: `true` to
 * continue, or the sign-in URL to send the person back to.
 *
 * NextAuth's own rule (link nothing by email) is replaced by this one, and the
 * providers carry `allowDangerousEmailAccountLinking` only because this runs
 * first. An OAuth identity that is not linked yet may join the account whose
 * email it carries only when the provider vouches for that email
 * (`verifiedProviderEmail`). Any other match by email is refused with the
 * "sign in the way you did before" message, and X never joins anything.
 * Comparison ignores case; the adapter's lookup does too
 * (`withCaseInsensitiveEmailLookup`).
 */
export async function accountLinkingGate(input: {
  provider?: string;
  providerAccountId?: string;
  profile?: Profile;
}): Promise<true | string> {
  const { provider, providerAccountId, profile } = input;
  if (!provider || provider === "credentials") return true;
  try {
    if (providerAccountId) {
      const linked = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: { provider, providerAccountId },
        },
        select: { id: true },
      });
      if (linked) return true;
    }

    const verified = verifiedProviderEmail(provider, profile);
    const candidates = [
      ...new Set(
        [rawProviderEmail(provider, profile), verified].filter(
          (email): email is string => !!email
        )
      ),
    ];
    if (!candidates.length) return true;

    const owners = await prisma.user.findMany({
      where: {
        OR: candidates.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { id: true, email: true },
      take: 3,
    });
    if (!owners.length) return true;

    if (
      !NEVER_LINK_PROVIDERS.has(provider) &&
      verified &&
      owners.length === 1 &&
      normalizeEmail(owners[0].email) === verified
    ) {
      logger.info(
        "Linking a sign-in provider to an existing account by verified email",
        { provider, userId: owners[0].id },
        LOG_SOURCE
      );
      return true;
    }

    logger.info(
      "Refused a sign-in that would join an existing account without a verified email",
      { provider },
      LOG_SOURCE
    );
    return LINK_REFUSED_REDIRECT;
  } catch (error) {
    logger.error(
      "Failed to check account linking",
      {
        provider,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return LINK_FAILED_REDIRECT;
  }
}

type AuthAdapter = NonNullable<NextAuthOptions["adapter"]>;
type GetUserByEmail = NonNullable<AuthAdapter["getUserByEmail"]>;

/**
 * The Prisma adapter finds the account for an OAuth email with an exact
 * match, so `Ann@x.com` from a provider would miss `ann@x.com` and create a
 * second user. `accountLinkingGate` has already decided whether joining is
 * allowed; this makes the adapter find the same account the gate checked.
 */
export function withCaseInsensitiveEmailLookup(
  adapter: AuthAdapter
): AuthAdapter {
  if (!adapter?.getUserByEmail) return adapter;
  const getUserByEmail = (async (email: string) => {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
    });
    return user ?? null;
  }) as unknown as GetUserByEmail;
  return { ...adapter, getUserByEmail };
}
