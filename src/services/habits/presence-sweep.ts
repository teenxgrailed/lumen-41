import {
  type NotificationPrefs,
  getNotificationPrefs,
  shouldAlert,
} from "@/services/notifications/preferences";
import {
  PUSH_TARGET_SELECT,
  type PushTarget,
  pushConfigured,
  pushTargetsOf,
} from "@/services/push/targets";
import { deliverPush } from "@/services/reminders/reminder-delivery";
import { HabitEventType, HabitKind, Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { HABITS_QUIT } from "@/lib/feature-flags-keys";
import { habitDateFromKey } from "@/lib/habit-completion-date";
import { summarizeQuit } from "@/lib/habits-quit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  type PresenceKind,
  type PresenceText,
  daysSinceCheckIn,
  habitReminderDue,
  habitRunsToday,
  inPresenceWindow,
  localClock,
  milestoneToAnnounce,
  presenceText,
  reengageDue,
} from "./presence";

const LOG_SOURCE = "HabitPresence";
const USERS_PER_PAGE = 200;
const MAX_PAGES = 50;
/** How far back completions are read: enough for the re-engage rule. */
const COMPLETION_LOOKBACK_DAYS = 14;
const HABITS_URL = "/habits";

interface Candidate {
  kind: PresenceKind;
  habitId: string | null;
  /** The dedup scope: the habit id, or "user". */
  scope: string;
  dayKey: string;
  text: PresenceText;
  /** Runs after the push was delivered. */
  after?: () => Promise<unknown>;
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Claims one push: the unique row is the dedup, taken before sending, so two
 * sweeps (or two workers) cannot both send it. false = already claimed.
 */
async function claim(userId: string, candidate: Candidate) {
  try {
    const row = await prisma.habitPush.create({
      data: {
        userId,
        habitId: candidate.habitId,
        scope: candidate.scope,
        kind: candidate.kind,
        dayKey: candidate.dayKey,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

async function send(
  userId: string,
  targets: PushTarget[],
  candidate: Candidate
): Promise<boolean> {
  const claimId = await claim(userId, candidate);
  if (!claimId) return false;
  const results = await Promise.allSettled(
    targets.map((target) =>
      deliverPush(target, {
        title: candidate.text.title,
        body: candidate.text.body,
        url: HABITS_URL,
      })
    )
  );
  const delivered = results.some(
    (result) => result.status === "fulfilled" && result.value
  );
  if (!delivered) {
    // Nothing reached a device: release the claim so the next sweep inside the
    // window may try again.
    await prisma.habitPush.delete({ where: { id: claimId } }).catch(() => null);
    return false;
  }
  await candidate.after?.();
  return true;
}

/** The flag is off for everybody unless a row or an override turns it on. */
async function flagCanBeOn() {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: HABITS_QUIT },
    select: { enabled: true, _count: { select: { overrides: true } } },
  });
  return Boolean(flag && (flag.enabled || flag._count.overrides > 0));
}

interface PresenceHabit {
  id: string;
  title: string;
  kind: HabitKind;
  at: string | null;
  daysOfWeek: number[];
  remindersEnabled: boolean;
  quitStartedAt: Date | null;
  createdAt: Date;
  completions: { date: Date }[];
  /** RELAPSE events only: the only ones that move a streak. */
  events: { type: HabitEventType; at: Date }[];
}

export type UserRow = Parameters<typeof pushTargetsOf>[0] & {
  id: string;
  habits: PresenceHabit[];
};

/**
 * What is due for one person now. Pure over its inputs apart from the
 * `after` callbacks it attaches.
 */
export function presenceCandidates(input: {
  user: UserRow;
  prefs: NotificationPrefs;
  settings: {
    habitReminders: boolean;
    habitCheckin: boolean;
    habitCheckinTime: string;
    habitMilestones: boolean;
    habitReengage: boolean;
  };
  lastReengageAt: Date | null;
  now: Date;
  recordMilestone: (habitId: string, at: Date) => Promise<unknown>;
}): Candidate[] {
  const { user, prefs, settings, now } = input;
  const clock = localClock(now, prefs.timeZone);
  const out: Candidate[] = [];
  const doneToday = (habit: PresenceHabit) =>
    habit.completions.some(
      (completion) =>
        completion.date.getTime() === habitDateFromKey(clock.dayKey).getTime()
    );

  const build = user.habits.filter((habit) => habit.kind === HabitKind.BUILD);
  const quit = user.habits.filter((habit) => habit.kind === HabitKind.QUIT);

  if (settings.habitReminders) {
    for (const habit of build) {
      if (!habit.remindersEnabled) continue;
      if (habitReminderDue(habit, clock, doneToday(habit))) {
        out.push({
          kind: "reminder",
          habitId: habit.id,
          scope: habit.id,
          dayKey: clock.dayKey,
          text: presenceText.reminder(habit.title),
        });
      }
    }
  }

  if (
    settings.habitCheckin &&
    inPresenceWindow(settings.habitCheckinTime, clock)
  ) {
    const open =
      build.filter(
        (habit) =>
          habit.remindersEnabled &&
          habitRunsToday(habit.daysOfWeek, clock) &&
          !doneToday(habit)
      ).length + quit.filter((habit) => habit.remindersEnabled).length;
    if (open > 0) {
      out.push({
        kind: "checkin",
        habitId: null,
        scope: "user",
        dayKey: clock.dayKey,
        text: presenceText.checkin(open),
      });
    }
  }

  if (settings.habitMilestones) {
    for (const habit of quit) {
      if (!habit.remindersEnabled || !habit.quitStartedAt) continue;
      const summary = summarizeQuit({
        quitStartedAt: habit.quitStartedAt,
        events: habit.events,
        now,
        timeZone: prefs.timeZone,
      });
      const days = milestoneToAnnounce(summary);
      if (days === null || !summary.streakStartedAt) continue;
      out.push({
        kind: "milestone",
        habitId: habit.id,
        // One push per milestone per streak: the key is the milestone and the
        // day the streak began.
        scope: `${habit.id}:${days}`,
        dayKey: localClock(summary.streakStartedAt, prefs.timeZone).dayKey,
        text: presenceText.milestone(habit.title, days),
        after: () => input.recordMilestone(habit.id, now),
      });
    }
  }

  if (settings.habitReengage && build.length > 0) {
    const daysQuiet = Math.min(
      ...build.map((habit) =>
        daysSinceCheckIn(
          clock.dayKey,
          habit.completions.map((completion) =>
            completion.date.toISOString().slice(0, 10)
          ),
          localClock(habit.createdAt, prefs.timeZone).dayKey
        )
      )
    );
    if (
      reengageDue({
        clock,
        daysQuiet,
        lastReengageAt: input.lastReengageAt,
        now,
      })
    ) {
      out.push({
        kind: "reengage",
        habitId: null,
        scope: "user",
        dayKey: clock.dayKey,
        text: presenceText.reengage(),
      });
    }
  }
  return out;
}

//todo: prefilter people by flag overrides instead of one flag lookup per person once the user base grows.
export async function runHabitPresenceSweep(now = newDate()) {
  if (!pushConfigured()) return { users: 0, pushed: 0 };
  if (!(await flagCanBeOn())) return { users: 0, pushed: 0 };

  const since = newDate(now.getTime() - COMPLETION_LOOKBACK_DAYS * 86_400_000);
  let cursor: string | undefined;
  let users = 0;
  let pushed = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await prisma.user.findMany({
      where: {
        habits: { some: { archivedAt: null, isActive: true } },
        OR: [
          { pushSubscriptions: { some: {} } },
          { nativePushTokens: { some: {} } },
        ],
      },
      orderBy: { id: "asc" },
      take: USERS_PER_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        ...PUSH_TARGET_SELECT,
        habits: {
          where: { archivedAt: null, isActive: true },
          select: {
            id: true,
            title: true,
            kind: true,
            at: true,
            daysOfWeek: true,
            remindersEnabled: true,
            quitStartedAt: true,
            createdAt: true,
            completions: {
              where: { date: { gte: since } },
              select: { date: true },
            },
            // Only relapses move a streak; urges are not needed here.
            events: {
              where: { type: HabitEventType.RELAPSE },
              select: { type: true, at: true },
            },
          },
        },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const user of rows) {
      users += 1;
      try {
        pushed += await sweepUser(user, now);
      } catch (error) {
        await logger.error(
          "Habit presence failed for one person",
          {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      }
    }
    if (rows.length < USERS_PER_PAGE) break;
  }
  return { users, pushed };
}

async function sweepUser(user: UserRow, now: Date) {
  if (!(await isFeatureEnabled(HABITS_QUIT, user.id))) return 0;
  const [prefs, settings] = await Promise.all([
    getNotificationPrefs(user.id),
    prisma.notificationSettings.findUnique({
      where: { userId: user.id },
      select: {
        habitReminders: true,
        habitCheckin: true,
        habitCheckinTime: true,
        habitMilestones: true,
        habitReengage: true,
      },
    }),
  ]);
  // Quiet hours, the digest, the push channel and the Reminders switch.
  if (!shouldAlert(prefs, "reminder", "push", now)) return 0;
  const lastReengage = await prisma.habitPush.findFirst({
    where: { userId: user.id, kind: "reengage" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const candidates = presenceCandidates({
    user,
    prefs,
    settings: settings ?? {
      habitReminders: true,
      habitCheckin: true,
      habitCheckinTime: "21:00",
      habitMilestones: true,
      habitReengage: false,
    },
    lastReengageAt: lastReengage?.createdAt ?? null,
    now,
    recordMilestone: (habitId, at) =>
      prisma.habitEvent.create({
        data: { habitId, userId: user.id, type: HabitEventType.MILESTONE, at },
      }),
  });
  const targets = pushTargetsOf(user);
  let pushed = 0;
  for (const candidate of candidates) {
    if (await send(user.id, targets, candidate)) pushed += 1;
  }
  return pushed;
}
