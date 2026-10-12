import { createHash, randomBytes } from "node:crypto";

import { isSignInProviderId } from "@/lib/auth/sign-in-provider-ids";
import { addHours, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

export const ACCOUNT_REAUTH_WINDOW_MINUTES = 15;
export const REAUTH_CHALLENGE_COOKIE = "needt-account-reauth";

export function hashReauthenticationSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function reauthenticationExpiry(): Date {
  return addHours(newDate(), ACCOUNT_REAUTH_WINDOW_MINUTES / 60);
}

export async function recordCredentialReauthentication(
  userId: string,
  sessionHash: string
) {
  return prisma.accountReauthentication.create({
    data: {
      userId,
      sessionHash,
      authenticatedAt: newDate(),
      expiresAt: reauthenticationExpiry(),
      provider: "credentials",
    },
  });
}

export async function beginOAuthReauthentication(
  userId: string,
  sessionHash: string,
  provider: string
): Promise<string> {
  if (!isSignInProviderId(provider)) {
    throw new Error("UNSUPPORTED_REAUTH_PROVIDER");
  }
  const account = await prisma.account.findFirst({
    where: { userId, provider },
    select: { id: true },
  });
  if (!account) throw new Error("REAUTH_PROVIDER_NOT_CONNECTED");

  const challenge = randomBytes(32).toString("base64url");
  await prisma.accountReauthentication.create({
    data: {
      userId,
      sessionHash,
      challengeHash: hashReauthenticationSecret(challenge),
      provider,
      expiresAt: reauthenticationExpiry(),
    },
  });
  return challenge;
}

export async function completeOAuthReauthentication(
  userId: string,
  currentSessionHash: string,
  challenge: string
) {
  const challengeHash = hashReauthenticationSecret(challenge);
  const attempt = await prisma.accountReauthentication.findUnique({
    where: { challengeHash },
    include: { user: { select: { lastAuthenticatedAt: true } } },
  });
  if (
    !attempt ||
    attempt.userId !== userId ||
    attempt.authenticatedAt ||
    attempt.consumedAt ||
    attempt.expiresAt <= newDate() ||
    currentSessionHash === attempt.sessionHash ||
    !attempt.user.lastAuthenticatedAt ||
    attempt.user.lastAuthenticatedAt < attempt.createdAt
  ) {
    throw new Error("OAUTH_REAUTHENTICATION_FAILED");
  }

  return prisma.accountReauthentication.update({
    where: { id: attempt.id },
    data: {
      sessionHash: currentSessionHash,
      authenticatedAt: newDate(),
      challengeHash: null,
      expiresAt: reauthenticationExpiry(),
    },
  });
}

export async function deleteExpiredReauthentications(): Promise<number> {
  const result = await prisma.accountReauthentication.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: newDate() } }, { consumedAt: { not: null } }],
    },
  });
  return result.count;
}
