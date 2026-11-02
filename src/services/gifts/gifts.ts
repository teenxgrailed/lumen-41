import { recordAdminAudit } from "@/services/admin/audit";
import {
  BillingGrantError,
  grantManualPlan,
  revokeManualPlan,
} from "@/services/billing/manual-grant";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/** The lengths an admin can give. Whole days keep the comp mechanism exact. */
export const GIFT_MONTHS = [1, 3, 12] as const;
export type GiftMonths = (typeof GIFT_MONTHS)[number];

const GIFT_DAYS: Record<GiftMonths, number> = { 1: 30, 3: 91, 12: 365 };
export const GIFT_NOTE_MAX = 280;

export class GiftError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "GiftError";
  }
}

/**
 * A personal line in a gift: one paragraph, at most 280 characters, no control
 * characters and no markup. Returns the cleaned text, or null for none.
 */
export function cleanGiftNote(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > GIFT_NOTE_MAX) {
    throw new GiftError(
      400,
      `The note can be at most ${GIFT_NOTE_MAX} characters.`
    );
  }
  if (/[\u0000-\u001f\u007f<>]/.test(text)) {
    throw new GiftError(
      400,
      "The note cannot contain markup or control characters."
    );
  }
  return text;
}

/**
 * Gives Pro for 1, 3 or 12 months through the comp mechanism (no payment, no
 * Creem). Refused on an account with a purchase or Lifetime. A gift stacks
 * onto a comp that is still running and does not interfere with a trial: the
 * trial keeps its own end date and Pro simply continues until the later of
 * the two.
 */
export async function grantGift(input: {
  actorId: string;
  userId: string;
  months: number;
  note?: string | null;
  now?: Date;
}) {
  if (!(GIFT_MONTHS as readonly number[]).includes(input.months)) {
    throw new GiftError(400, "A gift is 1, 3 or 12 months.");
  }
  const months = input.months as GiftMonths;
  const note = cleanGiftNote(input.note);
  const now = input.now ?? newDate();
  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, sandboxKind: true },
  });
  if (!target) throw new GiftError(404, "That account does not exist.");
  if (target.sandboxKind) {
    throw new GiftError(409, "A sandbox account cannot receive a gift.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const granted = await grantManualPlan(tx, {
        userId: input.userId,
        kind: "pro_days",
        days: GIFT_DAYS[months],
        now,
      });
      const endsAt = granted.currentPeriodEnd;
      if (!endsAt) {
        throw new GiftError(409, "This account already has Lifetime.");
      }
      const gift = await tx.proGift.create({
        data: {
          userId: input.userId,
          grantedBy: input.actorId,
          months,
          personalNote: note,
          startsAt: now,
          endsAt,
        },
        select: { id: true, endsAt: true },
      });
      await recordAdminAudit(
        {
          actorId: input.actorId,
          targetUserId: input.userId,
          action: "user.gift_pro",
          details: {
            email: target.email,
            months,
            hasNote: Boolean(note),
            until: endsAt.toISOString(),
          },
        },
        tx
      );
      return gift;
    });
  } catch (error) {
    if (error instanceof BillingGrantError) {
      throw new GiftError(409, error.message);
    }
    throw error;
  }
}

/**
 * Marks every running gift of the person revoked, so no notice is sent for it.
 * Called with the transaction that revokes the comp itself.
 */
export async function revokeGifts(
  tx: Parameters<typeof revokeManualPlan>[0],
  userId: string,
  now: Date = newDate()
) {
  await tx.proGift.updateMany({
    where: { userId, revokedAt: null, endsAt: { gt: now } },
    data: { revokedAt: now },
  });
}

/**
 * Hourly. The comp itself lapses on its own (PRO, CANCELED, with an end date),
 * so this only stamps `expiredAt` for the record and for the gift screen.
 */
export async function expireProGifts(now: Date = newDate()): Promise<number> {
  const result = await prisma.proGift.updateMany({
    where: { expiredAt: null, endsAt: { lte: now } },
    data: { expiredAt: now },
  });
  return result.count;
}

/** The gift to show on the in-app screen: the newest running one not seen yet. */
export async function unseenGift(userId: string, now: Date = newDate()) {
  return prisma.proGift.findFirst({
    where: {
      userId,
      seenAt: null,
      revokedAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "desc" },
    select: { id: true, months: true, personalNote: true, endsAt: true },
  });
}

export async function markGiftSeen(
  userId: string,
  giftId: string,
  now: Date = newDate()
): Promise<boolean> {
  const result = await prisma.proGift.updateMany({
    where: { id: giftId, userId, seenAt: null },
    data: { seenAt: now },
  });
  return result.count === 1;
}
