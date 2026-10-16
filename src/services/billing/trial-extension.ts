import { Prisma } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { trialEmailKey } from "@/lib/trials/trial-service";

export class TrialExtensionError extends Error {
  constructor(
    readonly code: "NO_EMAIL" | "EMAIL_USED",
    message: string
  ) {
    super(message);
    this.name = "TrialExtensionError";
  }
}

/**
 * Adds days to a person's trial inside the caller's transaction: after the
 * current end when the trial is still running, from now when it is over, and a
 * new trial when they never had one. The one-trial-per-address key is the same
 * HMAC the sign-up path writes, so an extension cannot be used to get a second
 * trial for an address that already spent one under another account.
 */
export async function extendTrialDays(
  tx: Prisma.TransactionClient,
  input: { userId: string; email: string | null; days: number; now?: Date }
): Promise<Date> {
  if (!input.email) {
    throw new TrialExtensionError(
      "NO_EMAIL",
      "This account has no email address."
    );
  }
  const now = input.now ?? newDate();
  const grant = await tx.trialGrant.findUnique({
    where: { userId: input.userId },
    select: { id: true, endsAt: true },
  });
  if (grant) {
    const endsAt = addCalendarDays(
      grant.endsAt > now ? grant.endsAt : now,
      input.days
    );
    await tx.trialGrant.update({ where: { id: grant.id }, data: { endsAt } });
    return endsAt;
  }
  const endsAt = addCalendarDays(now, input.days);
  try {
    await tx.trialGrant.create({
      data: {
        emailKey: trialEmailKey(input.email),
        userId: input.userId,
        startedAt: now,
        endsAt,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TrialExtensionError(
        "EMAIL_USED",
        "This address has already used a trial under another account."
      );
    }
    throw error;
  }
  return endsAt;
}
