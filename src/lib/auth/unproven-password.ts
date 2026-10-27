import { Prisma } from "@prisma/client";

import { revokeAllAccess } from "@/lib/auth/session-version";
import { addHours, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "UnprovenPassword";

/**
 * A password set at sign-up is "unproven" until the email is confirmed: nobody
 * has shown they own the inbox, so the password may belong to someone who
 * registered another person's address (account pre-hijack). Three rules keep
 * such a password from ever becoming the way into a confirmed account:
 *
 * - confirming from a browser that is not the signing-up session asks for a
 *   new password and revokes every earlier session (email-verification.ts);
 * - an OAuth sign-in that proves the address wipes it (account-linking.ts);
 * - registering the address again after UNPROVEN_REPLACE_AFTER_HOURS replaces
 *   it (the register route).
 */
export const UNPROVEN_REPLACE_AFTER_HOURS = 24;

export type UnprovenPasswordAudit =
  | "auth.unproven_password_wiped"
  | "auth.unproven_password_replaced"
  | "auth.unproven_password_reset_on_confirm";

/**
 * The audit write, unawaited so it joins the transaction of the change it
 * records. System-made: no actor. `details` holds no secret.
 */
export function unprovenPasswordAudit(
  userId: string,
  action: UnprovenPasswordAudit,
  details: Prisma.InputJsonValue
) {
  return prisma.adminAuditLog.create({
    data: { actorId: null, targetUserId: userId, action, details },
    select: { id: true },
  });
}

/** True when an account's credentials password has never been proven. */
export function isUnprovenPasswordAccount(user: {
  emailVerified: Date | null;
  accounts: ReadonlyArray<{ provider: string; id_token: string | null }>;
}): boolean {
  return (
    !user.emailVerified &&
    user.accounts.some((a) => a.provider === "credentials" && !!a.id_token)
  );
}

/** Whether an unconfirmed account is old enough for its password to be replaced. */
export function unprovenPasswordReplaceable(
  createdAt: Date | null,
  now: Date = newDate()
): boolean {
  if (!createdAt) return true;
  return addHours(createdAt, UNPROVEN_REPLACE_AFTER_HOURS) <= now;
}

/**
 * An OAuth sign-in whose provider vouched for this very address proves the
 * inbox is the signer's: the account is confirmed, the unproven password is
 * wiped (password sign-in stays off until a reset), every earlier session and
 * connector token dies, and the change is logged.
 */
export async function claimUnconfirmedAccountByProvider(input: {
  userId: string;
  provider: string;
  now?: Date;
}) {
  await prisma.$transaction([
    ...revokeAllAccess(input.userId),
    prisma.user.update({
      where: { id: input.userId },
      data: { emailVerified: input.now ?? newDate() },
      select: { id: true },
    }),
    prisma.account.updateMany({
      where: { userId: input.userId, provider: "credentials" },
      data: { id_token: null },
    }),
    unprovenPasswordAudit(input.userId, "auth.unproven_password_wiped", {
      provider: input.provider,
    }),
  ]);
  await logger.info(
    "Unconfirmed account claimed by a verified provider sign-in; password wiped",
    { userId: input.userId, provider: input.provider },
    LOG_SOURCE
  );
}

/**
 * Swaps the unproven password for a new one and signs every earlier session
 * out. `action` says why, for the audit log.
 */
export async function replaceUnprovenPassword(input: {
  userId: string;
  passwordHash: string;
  action: Extract<
    UnprovenPasswordAudit,
    | "auth.unproven_password_replaced"
    | "auth.unproven_password_reset_on_confirm"
  >;
  extra?: Prisma.InputJsonObject;
}) {
  await prisma.$transaction([
    ...revokeAllAccess(input.userId),
    prisma.account.updateMany({
      where: { userId: input.userId, provider: "credentials" },
      data: { id_token: input.passwordHash },
    }),
    unprovenPasswordAudit(input.userId, input.action, input.extra ?? {}),
  ]);
}
