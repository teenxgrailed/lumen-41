import { isManualSubscription } from "@/services/billing/manual-grant";
import {
  BillingProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { addCalendarDays } from "@/lib/date-utils";
import { APPLE_PERIOD_SLACK_MS } from "@/lib/entitlements";

import { isInternalAccount } from "./internal-accounts";

/**
 * The Admin Overview numbers, computed in memory from plain rows so every tile
 * can be tested. `overview-stats-data.ts` reads the rows; nothing here touches
 * the database.
 *
 * Definitions (owner, 15.11.2026):
 * - Paying: an account with a successful Creem payment (see `isCreemPayer`),
 *   or a live production App Store subscription. Money, not a plan.
 * - Granted: Pro or Lifetime given by hand (a comp subscription, or a running
 *   Pro gift). Never counted as paying.
 * - Internal accounts (`isInternalAccount`) are left out of every tile unless
 *   the toggle is off. The goals always count external accounts only.
 */

/** The activation funnel, in order. Names are the `ActivationEvent` names. */
export const FUNNEL_STEPS = [
  "account_created",
  "calendar_connected",
  "task_created",
  "replan_shown",
  "keep_applied",
] as const;

export const SIDE_EVENTS = [
  "first_replan_card_shown",
  "first_replan_skipped",
  "undo_applied",
  "fill_applied",
] as const;

export type FunnelStepName = (typeof FUNNEL_STEPS)[number];
export type SideEventName = (typeof SIDE_EVENTS)[number];

/** Creem events that mean money moved. */
export const PAID_EVENT_TYPES = [
  "checkout.completed",
  "subscription.paid",
] as const;
/** Receipt outcomes where the event was applied (the rest were skipped). */
export const APPLIED_OUTCOMES = [
  "processed",
  "processed_without_lifetime_reservation",
] as const;

/**
 * Current launch criteria (owner, 14-15.11.2026) and the long goal behind them
 * (decision 05.11.2026, same values as `GROWTH_GOAL` in growth.ts).
 */
export const LAUNCH_GOALS = {
  keep: { target: 5, deadline: "2026-11-30" },
  paying: { target: 10, deadline: "2026-12-31" },
  may: { weeklyActives: 300, paying: 100, deadline: "2027-05-05" },
} as const;

export const STATS_TREND_WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatUser {
  id: string;
  email: string | null;
  role: string | null;
  sandboxKind: string | null;
  internal: boolean;
  createdAt: Date | null;
  lastActiveAt: Date | null;
}

export interface StatSubscription {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: BillingProvider | null;
  currentPeriodEnd: Date | null;
  amount: number | null;
  creemCustomerId: string | null;
  creemSubscriptionId: string | null;
  creemProductId: string | null;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  appleOriginalTransactionId: string | null;
  appleEnvironment: string | null;
}

export interface StatPaymentEvent {
  userId: string;
  eventType: string;
  outcome: string;
}

/** The newest time each (user, event name) pair happened. */
export interface StatActivationRow {
  userId: string;
  name: string;
  lastAt: Date;
}

export interface StatsInput {
  now: Date;
  excludeInternal: boolean;
  ownerEmails: readonly string[];
  users: StatUser[];
  /** Subscriptions with a plan other than Free. */
  subscriptions: StatSubscription[];
  paymentEvents: StatPaymentEvent[];
  /** Users inside a running trial. */
  trialUserIds: string[];
  /** Users with a Pro gift running now. */
  giftUserIds: string[];
  activation: StatActivationRow[];
  /**
   * Per rolling week, newest first (index 0 is the current week): the users
   * with any product event other than account_created.
   */
  weeklyEventUserIds: string[][];
  waitlist: number;
}

export interface FunnelStep {
  name: FunnelStepName;
  users7Days: number;
  users30Days: number;
}

export interface GoalProgress {
  value: number;
  target: number;
  deadline: string;
  daysLeft: number;
  met: boolean;
}

export interface OverviewStats {
  excludeInternal: boolean;
  /** How many accounts the internal rule matches, whatever the toggle says. */
  internal: { accounts: number; weeklyActives: number };
  users: { total: number; newLast7Days: number };
  activeTrials: number;
  /** `total` has ever paid; `activeNow` of them still hold the paid plan. */
  paying: { total: number; activeNow: number; creem: number; apple: number };
  granted: { total: number; pro: number; lifetime: number; gifts: number };
  free: number;
  waitlist: number;
  weeklyActives: number;
  funnel: FunnelStep[];
  sideEvents: {
    name: SideEventName;
    users7Days: number;
    users30Days: number;
  }[];
  /** Oldest first; users with a product event in each rolling week. */
  weeks: { from: string; activeUsers: number }[];
  goals: {
    keep: GoalProgress;
    paying: GoalProgress;
    may: { weeklyActives: GoalProgress; paying: GoalProgress };
  };
  generatedAt: string;
}

/** Rolling 7-day windows ending at `now`; window i is (edges[i+1], edges[i]]. */
export function weekEdges(now: Date, weeks = STATS_TREND_WEEKS): Date[] {
  return Array.from(
    { length: weeks + 1 },
    (_, i) => new Date(now.getTime() - 7 * i * DAY_MS)
  );
}

function holdsLegacy(sub: StatSubscription, now: Date): boolean {
  if (sub.status === SubscriptionStatus.ACTIVE) return true;
  const lapsing: SubscriptionStatus[] = [
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.PAYMENT_FAILED,
  ];
  return (
    lapsing.includes(sub.status) &&
    sub.currentPeriodEnd !== null &&
    sub.currentPeriodEnd.getTime() > now.getTime()
  );
}

/** Same rule as `holdsPlan` in overview.ts, on a row instead of a filter. */
export function subscriptionHoldsPlan(
  sub: StatSubscription,
  now: Date
): boolean {
  if (sub.plan === SubscriptionPlan.FREE) return false;
  if (sub.plan !== SubscriptionPlan.PRO) return holdsLegacy(sub, now);
  if (
    sub.provider === BillingProvider.APPLE &&
    sub.currentPeriodEnd !== null &&
    sub.currentPeriodEnd.getTime() > now.getTime() - APPLE_PERIOD_SLACK_MS
  ) {
    return true;
  }
  return (
    (sub.provider === null || sub.provider === BillingProvider.CREEM) &&
    holdsLegacy(sub, now)
  );
}

/**
 * A successful Creem payment: an applied `subscription.paid`, or an applied
 * `checkout.completed` that took money (`Subscription.amount` above zero, so a
 * free or fully discounted checkout is not a payment).
 */
export function isCreemPayer(
  events: readonly StatPaymentEvent[],
  sub: Pick<StatSubscription, "amount"> | undefined
): boolean {
  const applied = events.filter(
    (event) =>
      (PAID_EVENT_TYPES as readonly string[]).includes(event.eventType) &&
      (APPLIED_OUTCOMES as readonly string[]).includes(event.outcome)
  );
  if (applied.some((event) => event.eventType === "subscription.paid")) {
    return true;
  }
  return applied.length > 0 && (sub?.amount ?? 0) > 0;
}

function daysUntil(day: string, now: Date): number {
  return Math.ceil((Date.parse(`${day}T00:00:00Z`) - now.getTime()) / DAY_MS);
}

function goal(
  value: number,
  target: number,
  deadline: string,
  now: Date
): GoalProgress {
  return {
    value,
    target,
    deadline,
    daysLeft: Math.max(0, daysUntil(deadline, now)),
    met: value >= target,
  };
}

type GrantedKind = "pro" | "lifetime" | "gift";

export function computeOverviewStats(input: StatsInput): OverviewStats {
  const { now, ownerEmails } = input;
  const since7 = addCalendarDays(now, -7);
  const since30 = addCalendarDays(now, -30);

  const internalIds = new Set(
    input.users
      .filter((u) => isInternalAccount(u, ownerEmails))
      .map((u) => u.id)
  );
  const isExternal = (id: string) => !internalIds.has(id);
  const users = input.users.filter(
    (u) => !input.excludeInternal || isExternal(u.id)
  );
  const countedIds = new Set(users.map((u) => u.id));
  const inCounted = (id: string) => countedIds.has(id);

  const subByUser = new Map(input.subscriptions.map((s) => [s.userId, s]));
  const eventsByUser = new Map<string, StatPaymentEvent[]>();
  for (const event of input.paymentEvents) {
    const list = eventsByUser.get(event.userId) ?? [];
    list.push(event);
    eventsByUser.set(event.userId, list);
  }
  const giftIds = new Set(input.giftUserIds);
  const trialIds = new Set(input.trialUserIds);

  /* One classification per account, then every tile just counts. */
  const payer = new Map<string, "creem" | "apple">();
  const granted = new Map<string, GrantedKind>();
  const holdsPaid = new Set<string>();
  const inTrial = new Set<string>();
  for (const user of input.users) {
    const sub = subByUser.get(user.id);
    const holds = sub ? subscriptionHoldsPlan(sub, now) : false;
    if (holds) holdsPaid.add(user.id);
    if (isCreemPayer(eventsByUser.get(user.id) ?? [], sub)) {
      payer.set(user.id, "creem");
    } else if (
      sub &&
      holds &&
      sub.appleOriginalTransactionId &&
      sub.appleEnvironment === "Production"
    ) {
      payer.set(user.id, "apple");
    } else if (sub && holds && isManualSubscription(sub)) {
      granted.set(
        user.id,
        sub.plan === SubscriptionPlan.LIFETIME ? "lifetime" : "pro"
      );
    } else if (giftIds.has(user.id)) {
      granted.set(user.id, "gift");
    }
    /* A trial person has not bought anything: no subscription row, or Free. */
    if (trialIds.has(user.id) && (!sub || sub.plan === SubscriptionPlan.FREE)) {
      inTrial.add(user.id);
    }
  }

  const countedPayers = users.filter((u) => payer.has(u.id));
  const countedGranted = users.filter((u) => granted.has(u.id));
  const grantedOf = (kind: GrantedKind) =>
    countedGranted.filter((u) => granted.get(u.id) === kind).length;

  const weeklyActive = (u: StatUser) =>
    u.lastActiveAt !== null && u.lastActiveAt.getTime() > since7.getTime();

  const didCount = (name: string, since: Date) =>
    new Set(
      input.activation
        .filter(
          (row) =>
            row.name === name &&
            row.lastAt.getTime() >= since.getTime() &&
            inCounted(row.userId)
        )
        .map((row) => row.userId)
    ).size;

  const edges = weekEdges(now, input.weeklyEventUserIds.length);
  const weeks = input.weeklyEventUserIds
    .map((ids, i) => ({
      from: edges[i + 1].toISOString(),
      activeUsers: new Set(ids.filter(inCounted)).size,
    }))
    .reverse();

  /* Goals are about people outside the team, whatever the toggle says. */
  const keepExternal = new Set(
    input.activation
      .filter((r) => r.name === "keep_applied" && isExternal(r.userId))
      .map((r) => r.userId)
  ).size;
  const payingExternal = input.users.filter(
    (u) => isExternal(u.id) && payer.has(u.id)
  ).length;
  const weeklyActivesExternal = input.users.filter(
    (u) => isExternal(u.id) && weeklyActive(u)
  ).length;

  return {
    excludeInternal: input.excludeInternal,
    internal: {
      accounts: internalIds.size,
      weeklyActives: input.users.filter(
        (u) => internalIds.has(u.id) && weeklyActive(u)
      ).length,
    },
    users: {
      total: users.length,
      newLast7Days: users.filter(
        (u) => u.createdAt !== null && u.createdAt.getTime() >= since7.getTime()
      ).length,
    },
    activeTrials: users.filter((u) => inTrial.has(u.id)).length,
    paying: {
      total: countedPayers.length,
      activeNow: countedPayers.filter((u) => holdsPaid.has(u.id)).length,
      creem: countedPayers.filter((u) => payer.get(u.id) === "creem").length,
      apple: countedPayers.filter((u) => payer.get(u.id) === "apple").length,
    },
    granted: {
      total: countedGranted.length,
      pro: grantedOf("pro"),
      lifetime: grantedOf("lifetime"),
      gifts: grantedOf("gift"),
    },
    free: users.filter(
      (u) => !(holdsPaid.has(u.id) || granted.has(u.id) || inTrial.has(u.id))
    ).length,
    waitlist: input.waitlist,
    weeklyActives: users.filter(weeklyActive).length,
    funnel: FUNNEL_STEPS.map((name) => ({
      name,
      users7Days: didCount(name, since7),
      users30Days: didCount(name, since30),
    })),
    sideEvents: SIDE_EVENTS.map((name) => ({
      name,
      users7Days: didCount(name, since7),
      users30Days: didCount(name, since30),
    })),
    weeks,
    goals: {
      keep: goal(
        keepExternal,
        LAUNCH_GOALS.keep.target,
        LAUNCH_GOALS.keep.deadline,
        now
      ),
      paying: goal(
        payingExternal,
        LAUNCH_GOALS.paying.target,
        LAUNCH_GOALS.paying.deadline,
        now
      ),
      may: {
        weeklyActives: goal(
          weeklyActivesExternal,
          LAUNCH_GOALS.may.weeklyActives,
          LAUNCH_GOALS.may.deadline,
          now
        ),
        paying: goal(
          payingExternal,
          LAUNCH_GOALS.may.paying,
          LAUNCH_GOALS.may.deadline,
          now
        ),
      },
    },
    generatedAt: now.toISOString(),
  };
}
