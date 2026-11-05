import { holdsPlan } from "@/services/admin/overview";
import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * The launch goal (owner decision 2026-11-05): 300 weekly actives and 100
 * paying people by 05.05.2027, with a checkpoint on 05.02.2027. Dates are UTC
 * calendar days.
 */
export const GROWTH_GOAL = {
  weeklyActives: 300,
  paying: 100,
  checkpoint: "2027-02-05",
  deadline: "2027-05-05",
} as const;

export const GROWTH_TREND_WEEKS = 8;

export interface GrowthWeek {
  /** First instant of the week, ISO; weeks are rolling 7-day windows ending now. */
  from: string;
  /** People whose latest activity falls in this week. */
  lastSeen: number;
  /** Paying people whose subscription row was created in this week. */
  newPaying: number;
}

export interface AdminGrowth {
  goal: typeof GROWTH_GOAL;
  /** Users with `lastActiveAt` in the last 7 days; sandbox accounts excluded. */
  weeklyActives: number;
  /**
   * What the app treats as paid right now: a Subscription on Pro or Lifetime
   * that still holds its plan (`holdsPlan`, the same rule as
   * `effectiveSubscriptionPlan`). Trials are not in it.
   */
  paying: { total: number; pro: number; lifetime: number };
  /** Trial people who have not paid; reported on their own, never added to `paying`. */
  activeTrials: number;
  daysToCheckpoint: number;
  daysToDeadline: number;
  /** Net adds per week still needed to reach the target by the deadline. */
  neededPerWeek: { weeklyActives: number; paying: number };
  /** Oldest week first; the last entry is the current week. */
  weeks: GrowthWeek[];
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(day: string, now: Date): number {
  return Math.ceil((Date.parse(`${day}T00:00:00Z`) - now.getTime()) / DAY_MS);
}

function perWeek(target: number, current: number, daysLeft: number): number {
  if (current >= target) return 0;
  return Math.ceil((target - current) / Math.max(daysLeft / 7, 1));
}

/**
 * Growth against the goal. About twenty `count` queries in one parallel batch,
 * each on a single table; no per-user work. Past weeks of actives are "last
 * seen in that week" (the column keeps only the latest activity), so older
 * weeks understate; the newest week is the real weekly-actives number.
 */
export async function getAdminGrowth(
  now: Date = newDate()
): Promise<AdminGrowth> {
  const edges = Array.from({ length: GROWTH_TREND_WEEKS + 1 }, (_, i) =>
    newDate(now.getTime() - 7 * i * DAY_MS)
  );
  /* Index 0 is the current week: (edges[1], edges[0]]. */
  const window = (i: number) => ({ gt: edges[i + 1], lte: edges[i] });
  const paid = (plan: SubscriptionPlan) => holdsPlan(plan, now);
  const anyPaid = {
    OR: [paid(SubscriptionPlan.PRO), paid(SubscriptionPlan.LIFETIME)],
  };

  const [pro, lifetime, trials, ...series] = await Promise.all([
    prisma.subscription.count({ where: paid(SubscriptionPlan.PRO) }),
    prisma.subscription.count({ where: paid(SubscriptionPlan.LIFETIME) }),
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
    ...Array.from({ length: GROWTH_TREND_WEEKS }, (_, i) =>
      prisma.user.count({
        where: { sandboxKind: null, lastActiveAt: window(i) },
      })
    ),
    ...Array.from({ length: GROWTH_TREND_WEEKS }, (_, i) =>
      prisma.subscription.count({
        where: { AND: [anyPaid, { createdAt: window(i) }] },
      })
    ),
  ]);
  const lastSeen = series.slice(0, GROWTH_TREND_WEEKS);
  const newPaying = series.slice(GROWTH_TREND_WEEKS);
  const weeks: GrowthWeek[] = Array.from(
    { length: GROWTH_TREND_WEEKS },
    (_, i) => ({
      from: edges[i + 1].toISOString(),
      lastSeen: lastSeen[i],
      newPaying: newPaying[i],
    })
  ).reverse();
  const weeklyActives = lastSeen[0];
  const payingTotal = pro + lifetime;
  const daysToDeadline = daysUntil(GROWTH_GOAL.deadline, now);
  return {
    goal: GROWTH_GOAL,
    weeklyActives,
    paying: { total: payingTotal, pro, lifetime },
    activeTrials: trials,
    daysToCheckpoint: daysUntil(GROWTH_GOAL.checkpoint, now),
    daysToDeadline,
    neededPerWeek: {
      weeklyActives: perWeek(
        GROWTH_GOAL.weeklyActives,
        weeklyActives,
        daysToDeadline
      ),
      paying: perWeek(GROWTH_GOAL.paying, payingTotal, daysToDeadline),
    },
    weeks,
    generatedAt: now.toISOString(),
  };
}
