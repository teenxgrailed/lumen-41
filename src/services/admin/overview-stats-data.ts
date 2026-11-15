import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { internalEmailsFromEnv } from "./internal-accounts";
import {
  APPLIED_OUTCOMES,
  type OverviewStats,
  PAID_EVENT_TYPES,
  STATS_TREND_WEEKS,
  computeOverviewStats,
  weekEdges,
} from "./overview-stats";

/**
 * Reads the rows `computeOverviewStats` counts. One query per table, all in
 * parallel; the user table is read whole (id, address, flags, two dates) and
 * filtered in memory, which is cheap while the user count is in the thousands.
 * Revisit with a SQL aggregate past roughly 50k accounts.
 */
export async function getOverviewStats(
  excludeInternal = true,
  now: Date = newDate()
): Promise<OverviewStats> {
  const edges = weekEdges(now, STATS_TREND_WEEKS);
  const [
    users,
    subscriptions,
    paymentEvents,
    trials,
    gifts,
    activation,
    waitlist,
    ...weekly
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        sandboxKind: true,
        internal: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.subscription.findMany({
      where: { plan: { not: SubscriptionPlan.FREE } },
      select: {
        userId: true,
        plan: true,
        status: true,
        provider: true,
        currentPeriodEnd: true,
        amount: true,
        creemCustomerId: true,
        creemSubscriptionId: true,
        creemProductId: true,
        stripeCustomerId: true,
        stripePaymentIntentId: true,
        appleOriginalTransactionId: true,
        appleEnvironment: true,
      },
    }),
    prisma.creemWebhookEvent.findMany({
      where: {
        eventType: { in: [...PAID_EVENT_TYPES] },
        outcome: { in: [...APPLIED_OUTCOMES] },
      },
      select: { userId: true, eventType: true, outcome: true },
    }),
    prisma.trialGrant.findMany({
      where: { endsAt: { gt: now }, userId: { not: null } },
      select: { userId: true },
    }),
    prisma.proGift.findMany({
      where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { userId: true },
    }),
    prisma.activationEvent.groupBy({
      by: ["userId", "name"],
      _max: { createdAt: true },
    }),
    prisma.waitlist.count(),
    /* Real weekly activity: users with a product event other than the signup. */
    ...Array.from({ length: STATS_TREND_WEEKS }, (_, i) =>
      prisma.activationEvent.groupBy({
        by: ["userId"],
        where: {
          name: { not: "account_created" },
          createdAt: { gt: edges[i + 1], lte: edges[i] },
        },
      })
    ),
  ]);

  return computeOverviewStats({
    now,
    excludeInternal,
    ownerEmails: internalEmailsFromEnv(),
    users,
    subscriptions,
    paymentEvents,
    trialUserIds: trials.flatMap((t) => (t.userId ? [t.userId] : [])),
    giftUserIds: gifts.map((g) => g.userId),
    activation: activation.flatMap((row) =>
      row._max.createdAt
        ? [{ userId: row.userId, name: row.name, lastAt: row._max.createdAt }]
        : []
    ),
    weeklyEventUserIds: weekly.map((rows) => rows.map((row) => row.userId)),
    waitlist,
  });
}
