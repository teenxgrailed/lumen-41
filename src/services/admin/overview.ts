import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminOverview";

export interface AdminOverview {
  users: { total: number; newLast7Days: number };
  /** People inside a trial who have not paid: a paying person is Pro or Lifetime. */
  activeTrials: number;
  plans: { pro: number; lifetime: number; free: number };
  waitlist: number;
  generatedAt: string;
}

/** Same rule as `effectiveSubscriptionPlan`: paid and active, or cancelled but still inside the paid period. */
function holdsPlan(plan: SubscriptionPlan, now: Date) {
  return {
    plan,
    OR: [
      { status: SubscriptionStatus.ACTIVE },
      {
        status: {
          in: [
            SubscriptionStatus.CANCELED,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.PAYMENT_FAILED,
          ],
        },
        currentPeriodEnd: { gt: now },
      },
    ],
  };
}

/**
 * The counts the Overview page shows. Six `count` queries on indexed or small
 * tables, no scans of content tables, no joins past one relation.
 */
export async function getAdminOverview(
  now: Date = newDate()
): Promise<AdminOverview> {
  const [total, newLast7Days, activeTrials, pro, lifetime, waitlist] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { createdAt: { gte: addCalendarDays(now, -7) } },
      }),
      prisma.trialGrant.count({
        where: {
          endsAt: { gt: now },
          userId: { not: null },
          user: {
            OR: [
              { subscription: { is: null } },
              { subscription: { is: { plan: SubscriptionPlan.FREE } } },
            ],
          },
        },
      }),
      prisma.subscription.count({
        where: holdsPlan(SubscriptionPlan.PRO, now),
      }),
      prisma.subscription.count({
        where: holdsPlan(SubscriptionPlan.LIFETIME, now),
      }),
      prisma.waitlist.count(),
    ]);
  const free = Math.max(0, total - pro - lifetime - activeTrials);
  await logger.info(
    "Admin overview read",
    { total, pro, lifetime, activeTrials },
    LOG_SOURCE
  );
  return {
    users: { total, newLast7Days },
    activeTrials,
    plans: { pro, lifetime, free },
    waitlist,
    generatedAt: now.toISOString(),
  };
}
