import { createHmac, timingSafeEqual } from "node:crypto";

import { AGE_CONFIRM_REQUIRED_MESSAGE } from "@/lib/auth/age-confirmation-copy";
import { authSecret } from "@/lib/auth/auth-secret";
import { isExistingOAuthUser } from "@/lib/auth/signups";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "AgeConfirmation";

/**
 * The Terms say Needt is for people who are at least 16. Every way to make an
 * account asks for this one confirmation: the email form sends
 * `ageConfirmed: true` to /api/auth/register, and an OAuth sign-up first calls
 * /api/auth/age-confirm, which leaves a short-lived signed cookie that the
 * NextAuth `signIn` callback requires before it lets the adapter create a
 * user. The time is stored on `User.ageConfirmedAt`.
 */
export { AGE_CONFIRM_REQUIRED_MESSAGE };
/** Where an OAuth return that would have made an account without it is sent. */
export const AGE_CONFIRM_REDIRECT = "/auth/signin?error=AgeConfirmRequired";

export const AGE_COOKIE = "needt_age_ok";
/** Long enough for a provider round trip, short enough to be a fresh choice. */
export const AGE_COOKIE_TTL_SECONDS = 30 * 60;

function signature(expiry: string): string {
  return createHmac("sha256", authSecret())
    .update(`age-confirmed:${expiry}`)
    .digest("base64url");
}

export function issueAgeToken(nowMs: number): string {
  const expiry = String(Math.floor(nowMs / 1000) + AGE_COOKIE_TTL_SECONDS);
  return `${expiry}.${signature(expiry)}`;
}

export function verifyAgeToken(
  token: string | undefined | null,
  nowMs: number
): boolean {
  if (!token) return false;
  const [expiry, candidate] = token.split(".");
  if (!expiry || !candidate || !/^\d{1,12}$/.test(expiry)) return false;
  const expected = Buffer.from(signature(expiry));
  const given = Buffer.from(candidate);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return false;
  }
  return Number(expiry) > Math.floor(nowMs / 1000);
}

/** The signed cookie of the current request, valid and unexpired. */
export async function hasAgeConfirmation(nowMs: number): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return verifyAgeToken(jar.get(AGE_COOKIE)?.value, nowMs);
  } catch {
    return false;
  }
}

/**
 * The NextAuth `signIn` decision for the age confirmation: `true` to carry on,
 * or the sign-in URL to send a would-be new user back to. People who already
 * have an account are untouched, and so is credentials sign-in (it never
 * creates a user; /api/auth/register has its own check).
 */
export async function ageConfirmationGate(input: {
  provider?: string;
  providerAccountId?: string;
  email?: string | null;
  nowMs: number;
}): Promise<true | string> {
  if (!input.provider || input.provider === "credentials") return true;
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
    return AGE_CONFIRM_REDIRECT;
  }
  if (await hasAgeConfirmation(input.nowMs)) return true;
  logger.info(
    "Refused OAuth sign-up without the age confirmation",
    { provider: input.provider },
    LOG_SOURCE
  );
  return AGE_CONFIRM_REDIRECT;
}
