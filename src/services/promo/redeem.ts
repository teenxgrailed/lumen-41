import {
  BillingGrantError,
  describeManualGrant,
  grantManualPlan,
} from "@/services/billing/manual-grant";
import {
  TrialExtensionError,
  extendTrialDays,
} from "@/services/billing/trial-extension";
import { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { CODE_PATTERN, type PromoKind, normalizePromoCode } from "./codes";

const LOG_SOURCE = "PromoRedeem";

export type PromoErrorCode =
  | "UNKNOWN"
  | "EXPIRED"
  | "USED_UP"
  | "ALREADY_USED"
  | "NOT_ELIGIBLE";

const STATUS: Record<PromoErrorCode, 404 | 409 | 410> = {
  UNKNOWN: 404,
  EXPIRED: 410,
  USED_UP: 409,
  ALREADY_USED: 409,
  NOT_ELIGIBLE: 409,
};

const MESSAGE: Record<Exclude<PromoErrorCode, "NOT_ELIGIBLE">, string> = {
  UNKNOWN: "That code is not valid.",
  EXPIRED: "That code has expired.",
  USED_UP: "That code has been used up.",
  ALREADY_USED: "You have already used that code.",
};

export class PromoError extends Error {
  readonly status: 404 | 409 | 410;
  constructor(
    readonly code: PromoErrorCode,
    message?: string
  ) {
    super(message ?? MESSAGE[code as keyof typeof MESSAGE]);
    this.name = "PromoError";
    this.status = STATUS[code];
  }
}

export interface PromoRedeemed {
  kind: PromoKind;
  /** What the person now has, in one line for the screen. */
  message: string;
}

/**
 * Applies a code for one person. Everything runs in one transaction, so a
 * code is only ever spent by a grant that went through:
 *
 * 1. the redemption row (unique per person and code) is the one-use guard;
 * 2. a conditional `UPDATE ... WHERE redeemedCount < maxRedemptions` is the
 *    cap. It is atomic in the database, so two people racing for the last use
 *    cannot both get it, and nothing reads a count and writes it back;
 * 3. the grant goes through the same services an admin's manual comp uses
 *    (`grantManualPlan`, `extendTrialDays`). If it refuses (the person
 *    already has a paid plan), the whole transaction rolls back and the code
 *    stays unspent.
 */
export async function redeemPromoCode(
  userId: string,
  rawCode: string
): Promise<PromoRedeemed> {
  const code = normalizePromoCode(rawCode);
  if (!CODE_PATTERN.test(code)) throw new PromoError("UNKNOWN");
  const now = newDate();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo) throw new PromoError("UNKNOWN");
      if (!promo.active || (promo.expiresAt && promo.expiresAt <= now)) {
        throw new PromoError("EXPIRED");
      }
      const used = await tx.promoRedemption.findUnique({
        where: { userId_codeId: { userId, codeId: promo.id } },
        select: { id: true },
      });
      if (used) throw new PromoError("ALREADY_USED");

      await tx.promoRedemption.create({
        data: { userId, codeId: promo.id },
      });
      const spent = await tx.promoCode.updateMany({
        where: {
          id: promo.id,
          active: true,
          ...(promo.maxRedemptions === null
            ? {}
            : { redeemedCount: { lt: promo.maxRedemptions } }),
        },
        data: { redeemedCount: { increment: 1 } },
      });
      if (spent.count !== 1) throw new PromoError("USED_UP");

      const kind = promo.kind as PromoKind;
      if (kind === "trial_days") {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        const endsAt = await extendTrialDays(tx, {
          userId,
          email: user?.email ?? null,
          days: promo.value ?? 0,
          now,
        });
        return {
          kind,
          codeId: promo.id,
          message: `Your trial now runs until ${endsAt.toISOString().slice(0, 10)}.`,
        };
      }
      if (kind === "pro_days" || kind === "lifetime") {
        const granted = await grantManualPlan(tx, {
          userId,
          kind,
          days: promo.value,
          now,
        });
        return {
          kind,
          codeId: promo.id,
          message: granted.currentPeriodEnd
            ? `${describeManualGrant(kind, promo.value)} added, until ${granted.currentPeriodEnd.toISOString().slice(0, 10)}.`
            : "You have Lifetime.",
        };
      }
      // A kind this release does not know (a later one wrote it): spend nothing.
      throw new PromoError("UNKNOWN");
    });
    await logger.info(
      "Promo code redeemed",
      { userId, codeId: result.codeId, kind: result.kind },
      LOG_SOURCE
    );
    return { kind: result.kind, message: result.message };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Two requests from the same person at once: the second hits the
      // unique (userId, codeId) and rolled back.
      throw new PromoError("ALREADY_USED");
    }
    if (error instanceof BillingGrantError) {
      throw new PromoError("NOT_ELIGIBLE", error.message);
    }
    if (error instanceof TrialExtensionError) {
      throw new PromoError("NOT_ELIGIBLE", error.message);
    }
    throw error;
  }
}
