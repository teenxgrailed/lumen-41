import {
  type MailProvider,
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

export function effectiveSubscriptionPlan(
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
  } | null,
  trial: { endsAt: Date } | null = null,
  now: Date = newDate()
): SubscriptionPlan {
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

export async function getPlan(userId: string): Promise<SubscriptionPlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscription: {
        select: { plan: true, status: true, currentPeriodEnd: true },
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
 * Free keeps three active habits (owner decision 2026-10-10). Archived habits
 * do not count, and habits above the limit after a downgrade stay editable:
 * only creating or restoring one more is refused.
 */
export async function canCreateHabit(userId: string): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.habit.count({ where: { userId, archivedAt: null } }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].habits, used);
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

export async function canAddCalendar(userId: string): Promise<LimitStatus> {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.connectedAccount.count({ where: { userId } }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].calendars, used);
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
