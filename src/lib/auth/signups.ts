import { isFeatureEnabledForEveryone } from "@/lib/feature-flags";
import { SIGNUPS_OPEN } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "Signups";

export const SIGNUPS_CLOSED_CODE = "SIGNUPS_CLOSED";
export const SIGNUPS_CLOSED_MESSAGE =
  "Registration is closed — join the waitlist at needt.app";
/** Where an OAuth return that would have made a new account is sent. */
export const SIGNUPS_CLOSED_REDIRECT = "/auth/signin?error=SignupsClosed";

/**
 * `NEEDT_SIGNUPS_OPEN=1` opens sign-up without a FeatureFlag row, but only
 * outside production or under CI, so a stray variable on the server can never
 * open registration by itself.
 */
function envOverrideOpen() {
  if (process.env.NEEDT_SIGNUPS_OPEN !== "1") return false;
  return process.env.NODE_ENV !== "production" || process.env.CI === "true";
}

/**
 * Whether a new account may be created. Closed unless the `signups_open` flag
 * is enabled for everybody; a database error also reads as closed.
 */
export async function areSignupsOpen(): Promise<boolean> {
  if (envOverrideOpen()) return true;
  try {
    return await isFeatureEnabledForEveryone(SIGNUPS_OPEN);
  } catch (error) {
    logger.error(
      "Failed to read the signups flag",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return false;
  }
}

/**
 * Whether an OAuth sign-in belongs to somebody who already has an account:
 * the provider account is already linked, or a user with that email exists
 * (NextAuth itself then decides whether to link or refuse with
 * `OAuthAccountNotLinked`). Anything else would create a user.
 */
export async function isExistingOAuthUser(input: {
  provider: string;
  providerAccountId: string;
  email?: string | null;
}): Promise<boolean> {
  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { id: true },
  });
  if (linked) return true;
  const email = input.email?.trim();
  if (!email) return false;
  // Exact match, as the Prisma adapter's getUserByEmail does: a case
  // mismatch must refuse rather than let the adapter create a second user.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return Boolean(user);
}

/**
 * The NextAuth `signIn` decision for registration: `true` to continue, or the
 * sign-in URL to send a would-be new user back to while sign-up is closed.
 * Credentials sign-in never creates a user, so it always continues.
 */
export async function oauthSignInGate(input: {
  provider?: string;
  providerAccountId?: string;
  email?: string | null;
}): Promise<true | string> {
  if (!input.provider || input.provider === "credentials") return true;
  if (await areSignupsOpen()) return true;
  try {
    if (
      input.providerAccountId &&
      (await isExistingOAuthUser({
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        email: input.email,
      }))
    ) {
      return true;
    }
  } catch (error) {
    logger.error(
      "Failed to check whether an OAuth sign-in has an account",
      {
        provider: input.provider,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return SIGNUPS_CLOSED_REDIRECT;
  }
  logger.info(
    "Refused OAuth sign-in that would create an account",
    { provider: input.provider },
    LOG_SOURCE
  );
  return SIGNUPS_CLOSED_REDIRECT;
}
