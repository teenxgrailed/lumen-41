import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { OPTIONAL_CATEGORIES } from "@/lib/email/categories";
import { resolveCategories } from "@/lib/email/preferences";
import { normalizeMailbox, suppressionKey } from "@/lib/email/suppression";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { rolloutBucket } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import type { Person } from "./types";
import { minutesOfDay } from "./zone";

/** The flag that gates every optional mail of the programme. */
export const EMAIL_PROGRAM_FLAG = "email_program";

type Counts = Map<string, number>;

function toCounts(rows: Array<{ userId: string | null; n: number }>): Counts {
  const out: Counts = new Map();
  for (const row of rows) {
    if (row.userId) out.set(row.userId, row.n);
  }
  return out;
}

export async function flagStates(
  userIds: string[]
): Promise<Map<string, boolean>> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: EMAIL_PROGRAM_FLAG },
    include: {
      overrides: {
        where: { userId: { in: userIds } },
        select: { userId: true, enabled: true },
      },
    },
  });
  const states = new Map<string, boolean>();
  for (const id of userIds) {
    const override = flag?.overrides.find((row) => row.userId === id);
    if (override) {
      states.set(id, override.enabled);
    } else if (!flag?.enabled) {
      states.set(id, false);
    } else {
      states.set(
        id,
        rolloutBucket(EMAIL_PROGRAM_FLAG, id) < flag.rolloutPercentage
      );
    }
  }
  return states;
}

/** The start of last calendar month and of this one, in UTC. */
export function lastMonthRange(now: Date): { from: Date; to: Date } {
  const to = newDate(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = newDate(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  return { from, to };
}

/**
 * Loads what `decide` needs for a batch of people in a fixed number of
 * queries (no per-person lookups). `withRecapStats` adds last month's activity
 * and is only worth its two queries for the monthly recap.
 */
export async function loadPeople(
  userIds: string[],
  now: Date,
  options: { withRecapStats?: boolean } = {}
): Promise<Map<string, Person>> {
  const people = new Map<string, Person>();
  if (userIds.length === 0) return people;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      lastActiveAt: true,
      sandboxKind: true,
      emailFewer: true,
      commercialEmailsOptOutAt: true,
      deletionRequest: { select: { status: true } },
      emailPreferences: { select: { category: true, enabled: true } },
      notificationSettings: {
        select: {
          emailNotifications: true,
          quietHours: true,
          quietStart: true,
          quietEnd: true,
        },
      },
      userSettings: { select: { timeZone: true } },
      subscription: {
        select: { plan: true, status: true, currentPeriodEnd: true },
      },
      trialGrant: {
        select: { startedAt: true, endsAt: true, day11SentAt: true },
      },
      proGifts: {
        where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
        select: { endsAt: true },
        orderBy: { endsAt: "desc" },
        take: 1,
      },
    },
  });

  const ids = users.map((user) => user.id);
  const emails = users
    .map((user) => user.email)
    .filter((email): email is string => Boolean(email));

  const [
    flags,
    suppressed,
    tasks,
    scheduled,
    calendars,
    marketing,
    completed,
    habitChecks,
  ] = await Promise.all([
    flagStates(ids),
    prisma.emailSuppression.findMany({
      where: { emailHash: { in: emails.map(suppressionKey) } },
      select: { emailHash: true },
    }),
    prisma.task.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, isSample: false },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        isSample: false,
        scheduledStart: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.calendarFeed.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, enabled: true, type: { not: "LOCAL" } },
      _count: { _all: true },
    }),
    prisma.emailSend.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        status: "sent",
        category: { in: [...OPTIONAL_CATEGORIES] },
      },
      _max: { sentAt: true },
    }),
    options.withRecapStats
      ? prisma.task.groupBy({
          by: ["userId"],
          where: {
            userId: { in: ids },
            isSample: false,
            completedAt: {
              gte: lastMonthRange(now).from,
              lt: lastMonthRange(now).to,
            },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    options.withRecapStats
      ? prisma.habitCompletion.findMany({
          where: {
            habit: { userId: { in: ids } },
            date: { gte: lastMonthRange(now).from, lt: lastMonthRange(now).to },
          },
          select: { habit: { select: { userId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const suppressedHashes = new Set(suppressed.map((row) => row.emailHash));
  const taskCounts = toCounts(
    tasks.map((row) => ({ userId: row.userId, n: row._count._all }))
  );
  const scheduledCounts = toCounts(
    scheduled.map((row) => ({ userId: row.userId, n: row._count._all }))
  );
  const calendarCounts = toCounts(
    calendars.map((row) => ({ userId: row.userId, n: row._count._all }))
  );
  const completedCounts = toCounts(
    completed.map((row) => ({ userId: row.userId, n: row._count._all }))
  );
  const habitCounts: Counts = new Map();
  for (const row of habitChecks) {
    const id = row.habit.userId;
    habitCounts.set(id, (habitCounts.get(id) ?? 0) + 1);
  }
  const lastMarketing = new Map<string, Date>();
  for (const row of marketing) {
    if (row.userId && row._max.sentAt) {
      lastMarketing.set(row.userId, row._max.sentAt);
    }
  }

  for (const user of users) {
    const plan = effectiveSubscriptionPlan(user.subscription, null, now);
    const gift = user.proGifts[0] ?? null;
    const quietSettings = user.notificationSettings;
    const quietStart = minutesOfDay(quietSettings?.quietStart);
    const quietEnd = minutesOfDay(quietSettings?.quietEnd);
    people.set(user.id, {
      userId: user.id,
      email: user.email,
      name: user.name,
      verifiedAt: user.emailVerified,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      sandbox: Boolean(user.sandboxKind),
      deleting: Boolean(
        user.deletionRequest &&
          ["SCHEDULED", "PROCESSING", "COMPLETED"].includes(
            user.deletionRequest.status
          )
      ),
      timeZone: user.userSettings?.timeZone ?? "UTC",
      quiet:
        quietSettings?.quietHours && quietStart !== null && quietEnd !== null
          ? { startMinute: quietStart, endMinute: quietEnd }
          : null,
      preferences: {
        categories: resolveCategories(
          user.emailPreferences,
          Boolean(user.commercialEmailsOptOutAt)
        ),
        fewer: user.emailFewer,
        paused: quietSettings?.emailNotifications === false,
      },
      suppressed: user.email
        ? suppressedHashes.has(suppressionKey(normalizeMailbox(user.email)))
        : false,
      flagOn: flags.get(user.id) ?? false,
      paid: plan !== SubscriptionPlan.FREE && !gift,
      trial: user.trialGrant
        ? {
            startedAt: user.trialGrant.startedAt,
            endsAt: user.trialGrant.endsAt,
            legacyThreeDaySentAt: user.trialGrant.day11SentAt,
          }
        : null,
      gift: gift ? { endsAt: gift.endsAt } : null,
      facts: {
        connectedCalendar: (calendarCounts.get(user.id) ?? 0) > 0,
        taskCount: taskCounts.get(user.id) ?? 0,
        scheduledTaskCount: scheduledCounts.get(user.id) ?? 0,
        lastMonthActivity:
          (completedCounts.get(user.id) ?? 0) + (habitCounts.get(user.id) ?? 0),
      },
      lastMarketingSentAt: lastMarketing.get(user.id) ?? null,
    });
  }
  return people;
}
