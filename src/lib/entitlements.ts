import {
  BillingProvider,
  type MailProvider,
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { endOfMonth, newDate, startOfMonth } from "@/lib/date-utils";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";

export { PLAN_LIMITS } from "@/lib/plan-limits";

export type LimitStatus = {
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  upgradeRequired: boolean;
  plan: SubscriptionPlan;
};

export function limitStatus(
  plan: SubscriptionPlan,
  limit: number | null,
  used: number
): LimitStatus {
  const normalizedUsed = Math.max(0, used);
  const allowed = limit === null || normalizedUsed < limit;
  return {
    allowed,
    limit,
    used: normalizedUsed,
    remaining: limit === null ? null : Math.max(0, limit - normalizedUsed),
    upgradeRequired: !allowed && plan === SubscriptionPlan.FREE,
    plan,
  };
}

/**
 * How long an App Store subscription keeps Pro past its paid-through date
 * when no renewal has been heard of yet. Apple renews shortly before the
 * period ends and the device and the notification both report it; past this
 * slack a missed renewal counts as no renewal, whatever the stored status.
 */
export const APPLE_PERIOD_SLACK_MS = 6 * 60 * 60 * 1000;

export function effectiveSubscriptionPlan(
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
    provider?: BillingProvider | null;
  } | null,
  trial: { endsAt: Date } | null = null,
  now: Date = newDate()
): SubscriptionPlan {
  // An App Store Pro is bounded by its period, never open-ended: a missed
  // EXPIRED notification must not mean Pro forever (Lifetime has no period).
  if (
    subscription?.provider === BillingProvider.APPLE &&
    subscription.plan === SubscriptionPlan.PRO
  ) {
    if (
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd.getTime() + APPLE_PERIOD_SLACK_MS >
        now.getTime()
    ) {
      return SubscriptionPlan.PRO;
    }
    if (trial?.endsAt && trial.endsAt > now) return SubscriptionPlan.PRO;
    return SubscriptionPlan.FREE;
  }
  if (
    subscription &&
    subscription.plan !== SubscriptionPlan.FREE &&
    subscription.status === SubscriptionStatus.ACTIVE
  ) {
    return subscription.plan;
  }
  if (
    subscription &&
    subscription.plan !== SubscriptionPlan.FREE &&
    (subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.PAST_DUE ||
      subscription.status === SubscriptionStatus.PAYMENT_FAILED) &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  ) {
    return subscription.plan;
  }
  if (trial?.endsAt && trial.endsAt > now) return SubscriptionPlan.PRO;
  return SubscriptionPlan.FREE;
}

type EntitlementDb = Pick<Prisma.TransactionClient, "user" | "habit">;

export async function getPlan(
  userId: string,
  db: EntitlementDb = prisma
): Promise<SubscriptionPlan> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
          provider: true,
        },
      },
      trialGrant: { select: { endsAt: true } },
    },
  });
  return effectiveSubscriptionPlan(
    user?.subscription ?? null,
    user?.trialGrant ?? null
  );
}

export async function canCreateBoard(userId: string): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.board.count({ where: { userId } }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].boards, used);
}

/**
 * Free keeps three active habits (owner decision 2026-10-10). First-run examples
 * (`isSample`) and archived habits
 * do not count, and habits above the limit after a downgrade stay editable:
 * only creating or restoring one more is refused.
 */
export async function canCreateHabit(
  userId: string,
  db: EntitlementDb = prisma
): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId, db),
    db.habit.count({
      where: { userId, archivedAt: null, isSample: false },
    }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].habits, used);
}

/**
 * Check the habit allowance and write in one step. Two parallel requests would
 * each count the same active habits and both create one, so a Free account
 * could end above its limit. A Postgres advisory lock per person, held for the
 * transaction, makes the second request wait and count the first one's habit.
 * `write` runs only when there is room, on the same transaction client.
 */
export async function withHabitSlot<T>(
  userId: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<
  { allowed: true; value: T } | { allowed: false; entitlement: LimitStatus }
> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`needt-habit-limit:${userId}`}, 0))`
    );
    const entitlement = await canCreateHabit(userId, tx);
    if (!entitlement.allowed) return { allowed: false, entitlement } as const;
    return { allowed: true, value: await write(tx) } as const;
  });
}

export async function canAutoScheduleMore(
  userId: string
): Promise<LimitStatus> {
  const now = newDate();
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.task.count({
      where: {
        userId,
        isSample: false,
        lastScheduled: {
          gte: startOfMonth(now),
          lte: endOfMonth(now),
        },
        OR: [{ isAutoScheduled: true }, { autoScheduled: true }],
      },
    }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].autoScheduledTasks, used);
}

export async function canAddMailbox(
  userId: string,
  existingIdentity?: { provider: MailProvider; address: string }
): Promise<LimitStatus> {
  const [plan, used, existing] = await Promise.all([
    getPlan(userId),
    prisma.mailAccount.count({ where: { userId } }),
    existingIdentity
      ? prisma.mailAccount.findUnique({
          where: {
            userId_provider_address: {
              userId,
              provider: existingIdentity.provider,
              address: existingIdentity.address,
            },
          },
          select: { id: true },
        })
      : null,
  ]);
  const status = limitStatus(plan, PLAN_LIMITS[plan].mailboxes, used);
  return existing
    ? { ...status, allowed: true, upgradeRequired: false }
    : status;
}

/**
 * Whether another calendar account fits the plan. Only accounts that carry a
 * calendar count: the same Google row also holds Tasks and Gmail tokens, and
 * those must not use up the calendar slot. `identity` is the account being
 * (re)authorised; one that already carries calendars is a reconnect, not an
 * addition. Without `email` it matches any account of that provider, which
 * lets the OAuth start route let a reconnect through before the address is
 * known (the callback judges the exact account).
 */
export async function canAddCalendar(
  userId: string,
  identity?: { provider: string; email?: string }
): Promise<LimitStatus> {
  const [plan, used, existing] = await Promise.all([
    getPlan(userId),
    prisma.connectedAccount.count({
      where: { userId, calendars: { some: {} } },
    }),
    identity
      ? prisma.connectedAccount.findFirst({
          where: {
            userId,
            provider: identity.provider,
            ...(identity.email ? { email: identity.email } : {}),
            calendars: { some: {} },
          },
          select: { id: true },
        })
      : null,
  ]);
  const status = limitStatus(plan, PLAN_LIMITS[plan].calendars, used);
  return existing
    ? { ...status, allowed: true, upgradeRequired: false }
    : status;
}

export async function canUseAiAgent(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].aiAgent,
    limit: PLAN_LIMITS[plan].aiAgent ? 1 : 0,
    used: PLAN_LIMITS[plan].aiAgent ? 1 : 0,
    upgradeRequired: !PLAN_LIMITS[plan].aiAgent,
    plan,
  };
}

export async function canPlanMyDay(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].planMyDay,
    upgradeRequired: !PLAN_LIMITS[plan].planMyDay,
    plan,
  };
}

export async function canViewFocusStats(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].focusStats,
    limit: PLAN_LIMITS[plan].focusStats ? 1 : 0,
    used: PLAN_LIMITS[plan].focusStats ? 1 : 0,
    upgradeRequired: !PLAN_LIMITS[plan].focusStats,
    plan,
  };
}

export async function canUseAdvancedFocusModes(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].advancedFocusModes,
    plan,
  };
}

export async function canAddTaskReminder(
  userId: string,
  taskId: string
): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.taskReminder.count({ where: { userId, taskId, canceledAt: null } }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].remindersPerTask, used);
}

export async function canCreateBookingPage(
  userId: string
): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.bookingPage.count({ where: { userId, isActive: true } }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].bookingPages, used);
}

export async function canUseAdvancedNudges(userId: string) {
  const plan = await getPlan(userId);
  return { allowed: PLAN_LIMITS[plan].advancedNudges, plan };
}

/**
 * Goals are Pro. Free can still read, edit and close the goals it already
 * has (after a downgrade); only making a new one is refused.
 */
export async function canUseGoals(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].goals,
    upgradeRequired: !PLAN_LIMITS[plan].goals,
    plan,
  };
}

/** Plans the agent hub is for once it is opened beyond its owner-only trial. */
export const AGENT_HUB_PLANS: readonly SubscriptionPlan[] = [
  SubscriptionPlan.PRO,
  SubscriptionPlan.LIFETIME,
];

/**
 * Whether the agent hub also needs a plan. Off while `agent_hub` is an
 * owner-only override: the flag alone decides, and the owner's own plan does
 * not matter. When the flag is opened to everyone, turn this on (Pro and
 * Lifetime then keep it, Free loses it) without touching a call site.
 */
export const AGENT_HUB_REQUIRES_PLAN = false;

/** The plan side of the agent hub's access; the `agent_hub` flag is still required. */
export async function canUseAgentHub(userId: string) {
  if (!AGENT_HUB_REQUIRES_PLAN) {
    return { allowed: true, upgradeRequired: false };
  }
  const plan = await getPlan(userId);
  const allowed = AGENT_HUB_PLANS.includes(plan);
  return { allowed, upgradeRequired: !allowed, plan };
}

/** Attachments on hub items are Pro. Free cannot add them. */
export async function canUseHubAttachments(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].hubAttachments,
    upgradeRequired: !PLAN_LIMITS[plan].hubAttachments,
    plan,
  };
}

/** Hub webhooks are Pro. Free cannot add them. */
export async function canUseHubWebhooks(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].hubWebhooks,
    upgradeRequired: !PLAN_LIMITS[plan].hubWebhooks,
    plan,
  };
}

/** Recurring hub items are Pro. Free cannot add them. */
export async function canUseHubRecurring(userId: string) {
  const plan = await getPlan(userId);
  return {
    allowed: PLAN_LIMITS[plan].hubRecurring,
    upgradeRequired: !PLAN_LIMITS[plan].hubRecurring,
    plan,
  };
}

/**
 * The hub's counted allowances for one person: agents (not disabled, the
 * Needt assistant's own row excluded), open items and memory notes. Existing
 * data above a limit after a downgrade is never removed; only a new create is
 * refused, which `limitStatus` reports as not allowed.
 */
export async function hubUsage(userId: string, db: EntitlementHubDb = prisma) {
  const [agents, openItems, notes] = await Promise.all([
    // The limit is per person, but an agent row exists per (person,
    // workspace, connection). One token used in two workspaces is one agent,
    // so count distinct connection keys. A revoked token disables its agent,
    // so a disabled row never counts.
    db.hubAgent
      .findMany({
        where: {
          userId,
          disabledAt: null,
          NOT: { connectionKey: "assistant" },
        },
        distinct: ["connectionKey"],
        select: { connectionKey: true },
      })
      .then((rows) => rows.length),
    db.hubItem.count({
      where: {
        userId,
        status: { notIn: ["done", "failed", "cancelled"] },
      },
    }),
    db.hubNote.count({ where: { userId } }),
  ]);
  return { agents, openItems, notes };
}

type EntitlementHubDb = Pick<
  Prisma.TransactionClient,
  "hubAgent" | "hubItem" | "hubNote"
>;

export type HubLimitKind = "agents" | "items" | "notes";

/**
 * Whether `adding` more of a hub resource fits the plan. `adding` is 1 for a
 * single create and the step count for a plan.
 */
export async function canAddToHub(
  userId: string,
  kind: HubLimitKind,
  adding = 1,
  db: EntitlementHubDb = prisma
): Promise<LimitStatus> {
  const [plan, usage] = await Promise.all([
    getPlan(userId),
    hubUsage(userId, db),
  ]);
  const limits = PLAN_LIMITS[plan];
  const [limit, used] =
    kind === "agents"
      ? [limits.hubAgents, usage.agents]
      : kind === "items"
        ? [limits.hubOpenItems, usage.openItems]
        : [limits.hubNotes, usage.notes];
  const status = limitStatus(plan, limit, used);
  if (limit === null || used + Math.max(1, adding) <= limit) return status;
  return {
    ...status,
    allowed: false,
    upgradeRequired: plan === SubscriptionPlan.FREE,
  };
}

/** How many days of hub history the person sees (7 on Free, 90 on Pro). */
export async function hubHistoryDays(userId: string): Promise<number> {
  const plan = await getPlan(userId);
  return PLAN_LIMITS[plan].hubHistoryDays;
}

/**
 * The history window for one request: its length, and whether the plan is
 * limited (Free), where an open item still shows its latest event.
 */
export async function hubHistoryWindow(
  userId: string
): Promise<{ days: number; limited: boolean }> {
  const plan = await getPlan(userId);
  return {
    days: PLAN_LIMITS[plan].hubHistoryDays,
    limited: plan === SubscriptionPlan.FREE,
  };
}
