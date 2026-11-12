import {
  type NotificationPrefs,
  prefsFrom,
  shouldAlert,
} from "@/services/notifications/preferences";
import {
  PUSH_TARGET_SELECT,
  type PushTarget,
  pushConfigured,
  pushTargetsOf,
} from "@/services/push/targets";
import { deliverPush } from "@/services/reminders/reminder-delivery";
import { HabitEventType, HabitKind } from "@prisma/client";
import { randomUUID } from "crypto";

import { newDate } from "@/lib/date-utils";
import { canUseQuitHabits } from "@/lib/entitlements";
import { rolloutBucket } from "@/lib/feature-flags";
import { HABITS_QUIT } from "@/lib/feature-flags-keys";
import { habitDateFromKey } from "@/lib/habit-completion-date";
import { summarizeQuit } from "@/lib/habits-quit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  MILESTONE_TIME,
  type PresenceKind,
  type PresenceText,
  REENGAGE_TIME,
  daysSinceCheckIn,
  habitReminderDue,
  habitRunsToday,
  inPresenceWindow,
  localClock,
  milestoneToAnnounce,
  presenceTag,
  presenceText,
  reengageDue,
} from "./presence";

const LOG_SOURCE = "HabitPresence";
const USERS_PER_PAGE = 200;
/** A safety stop only: a run that reaches it logs a warning. */
const MAX_PAGES = 500;
/** Dedup rows older than this are of no use any more and are deleted. */
const PUSH_ROW_RETENTION_DAYS = 30;
/** How far back completions are read: enough for the re-engage rule. */
const COMPLETION_LOOKBACK_DAYS = 14;
const HABITS_URL = "/habits";

interface Candidate {
  kind: PresenceKind;
  habitId: string | null;
  /** The dedup scope: the habit id, or "user". */
  scope: string;
  dayKey: string;
  /** The notification's tag (`presenceTag`). */
  tag: string;
  text: PresenceText;
  /** Runs after the push was delivered. */
  after?: () => Promise<unknown>;
}

/**
 * Claims one push: the unique row is the dedup, taken before sending, so two
 * sweeps (or two workers) cannot both send it. false = already claimed.
 */
async function claim(userId: string, candidate: Candidate) {
  // createMany + skipDuplicates is INSERT .. ON CONFLICT DO NOTHING: an existing
  // row is a count of 0, not a thrown P2002 that Prisma logs as an error first.
  const id = randomUUID();
  const { count } = await prisma.habitPush.createMany({
    data: [
      {
        id,
        userId,
        habitId: candidate.habitId,
        scope: candidate.scope,
        kind: candidate.kind,
        dayKey: candidate.dayKey,
      },
    ],
    skipDuplicates: true,
  });
  return count > 0 ? id : null;
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
        tag: candidate.tag,
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
  try {
    await candidate.after?.();
  } catch (error) {
    // The push is out and the claim is taken; a failed follow-up must not hide
    // the person's other candidates.
    await logger.error(
      "Habit presence follow-up failed",
      {
        userId,
        kind: candidate.kind,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
  return true;
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
  /** Pro: QUIT habits get no check-in count and no milestones otherwise. */
  quitAllowed: boolean;
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
  const quit = input.quitAllowed
    ? user.habits.filter((habit) => habit.kind === HabitKind.QUIT)
    : [];

  if (settings.habitReminders) {
    for (const habit of build) {
      if (!habit.remindersEnabled) continue;
      if (habitReminderDue(habit, clock, doneToday(habit))) {
        out.push({
          kind: "reminder",
          habitId: habit.id,
          scope: habit.id,
          dayKey: clock.dayKey,
          tag: presenceTag({
            kind: "reminder",
            habitId: habit.id,
            dayKey: clock.dayKey,
          }),
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
        tag: presenceTag({
          kind: "checkin",
          habitId: null,
          dayKey: clock.dayKey,
        }),
        text: presenceText.checkin(open),
      });
    }
  }

  if (settings.habitMilestones && inPresenceWindow(MILESTONE_TIME, clock)) {
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
        tag: presenceTag({
          kind: "milestone",
          habitId: habit.id,
          dayKey: clock.dayKey,
          days,
        }),
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
        tag: presenceTag({
          kind: "reengage",
          habitId: null,
          dayKey: clock.dayKey,
        }),
        text: presenceText.reengage(),
      });
    }
  }
  return out;
}

interface FlagState {
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Map<string, boolean>;
}

/**
 * The `habits_quit` flag, read once per run. null = off for everybody (no row,
 * or disabled with no override that turns it on).
 */
async function loadFlag(): Promise<FlagState | null> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: HABITS_QUIT },
    select: {
      enabled: true,
      rolloutPercentage: true,
      overrides: { select: { userId: true, enabled: true } },
    },
  });
  if (!flag) return null;
  const overrides = new Map(flag.overrides.map((o) => [o.userId, o.enabled]));
  const anyOverrideOn = [...overrides.values()].some(Boolean);
  if (!flag.enabled && !anyOverrideOn) return null;
  return {
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage,
    overrides,
  };
}

/** The same rule as `isFeatureEnabled`, against the state read once. */
function flagOn(flag: FlagState, userId: string) {
  const override = flag.overrides.get(userId);
  if (override !== undefined) return override;
  if (!flag.enabled) return false;
  return rolloutBucket(HABITS_QUIT, userId) < flag.rolloutPercentage;
}

type SettingsRow = {
  habitReminders: boolean;
  habitCheckin: boolean;
  habitCheckinTime: string;
  habitMilestones: boolean;
  habitReengage: boolean;
};

const DEFAULT_HABIT_SETTINGS: SettingsRow = {
  habitReminders: true,
  habitCheckin: true,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  habitReengage: false,
};

type BareHabit = Omit<PresenceHabit, "completions" | "events">;
type BareUser = Omit<UserRow, "habits"> & { habits: BareHabit[] };

/** What could be due in this window: decides whether a person is worth loading. */
function anythingDue(
  habits: BareHabit[],
  settings: SettingsRow,
  clock: ReturnType<typeof localClock>
) {
  const build = habits.filter((h) => h.kind === HabitKind.BUILD);
  const quit = habits.filter((h) => h.kind === HabitKind.QUIT);
  return {
    reminder:
      settings.habitReminders &&
      build.some(
        (h) =>
          h.remindersEnabled &&
          habitRunsToday(h.daysOfWeek, clock) &&
          inPresenceWindow(h.at, clock)
      ),
    checkin:
      settings.habitCheckin &&
      inPresenceWindow(settings.habitCheckinTime, clock),
    milestone:
      settings.habitMilestones &&
      inPresenceWindow(MILESTONE_TIME, clock) &&
      quit.some((h) => h.remindersEnabled && h.quitStartedAt),
    reengage:
      settings.habitReengage &&
      build.length > 0 &&
      inPresenceWindow(REENGAGE_TIME, clock),
  };
}

//todo: with a partial rollout of habits_quit every person with a push device is still paged; prefilter by rollout bucket in SQL if the user base grows.
export async function runHabitPresenceSweep(now = newDate()) {
  if (!pushConfigured()) return { users: 0, pushed: 0 };
  const flag = await loadFlag();
  if (!flag) return { users: 0, pushed: 0 };
  // Disabled for everybody except the overrides: only they can be reached.
  const onlyIds = flag.enabled
    ? null
    : [...flag.overrides].filter(([, on]) => on).map(([id]) => id);

  const since = newDate(now.getTime() - COMPLETION_LOOKBACK_DAYS * 86_400_000);
  let cursor: string | undefined;
  let users = 0;
  let pushed = 0;
  let page = 0;
  for (;;) {
    if (page >= MAX_PAGES) {
      await logger.warn(
        "Habit presence stopped at the page cap; people are left unswept",
        { pages: page, users },
        LOG_SOURCE
      );
      break;
    }
    page += 1;
    const rows = await prisma.user.findMany({
      where: {
        ...(onlyIds ? { id: { in: onlyIds } } : {}),
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
          },
        },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    pushed += await sweepPage(rows as BareUser[], flag, since, now);
    users += rows.length;
    if (rows.length < USERS_PER_PAGE) break;
  }

  await pruneOldPushRows(now);
  return { users, pushed };
}

/** Old dedup rows go once an hour or so; failing to prune never fails a sweep. */
async function pruneOldPushRows(now: Date) {
  if (now.getUTCMinutes() >= 10) return;
  try {
    await prisma.habitPush.deleteMany({
      where: {
        createdAt: {
          lt: newDate(now.getTime() - PUSH_ROW_RETENTION_DAYS * 86_400_000),
        },
      },
    });
  } catch (error) {
    await logger.error(
      "Habit presence prune failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

/** One page: shared reads batched, then only the people with something due. */
async function sweepPage(
  rows: BareUser[],
  flag: FlagState,
  since: Date,
  now: Date
) {
  const people = rows.filter((user) => flagOn(flag, user.id));
  if (people.length === 0) return 0;
  const ids = people.map((user) => user.id);
  const [settingRows, zoneRows] = await Promise.all([
    prisma.notificationSettings.findMany({ where: { userId: { in: ids } } }),
    prisma.userSettings.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, timeZone: true },
    }),
  ]);
  const settingsOf = new Map(settingRows.map((row) => [row.userId, row]));
  const zoneOf = new Map(zoneRows.map((row) => [row.userId, row.timeZone]));

  // Each person's local clock decides who is worth loading further.
  const due = new Map<
    string,
    {
      prefs: NotificationPrefs;
      settings: SettingsRow;
      what: ReturnType<typeof anythingDue>;
    }
  >();
  for (const user of people) {
    const row = settingsOf.get(user.id) ?? null;
    const prefs = prefsFrom(row, zoneOf.get(user.id));
    // Quiet hours, the digest, the push channel and the Reminders switch.
    if (!shouldAlert(prefs, "reminder", "push", now)) continue;
    const settings: SettingsRow = row ?? DEFAULT_HABIT_SETTINGS;
    const what = anythingDue(
      user.habits,
      settings,
      localClock(now, prefs.timeZone)
    );
    if (what.reminder || what.checkin || what.milestone || what.reengage) {
      due.set(user.id, { prefs, settings, what });
    }
  }
  if (due.size === 0) return 0;

  // QUIT is Pro. The plan is only looked up for a person whose QUIT habits can
  // change something in this sweep (a milestone or the check-in count), and a
  // Free person's QUIT habits are kept out of the relapse read below.
  const quitAllowedOf = new Map<string, boolean>();
  const dueUsers: BareUser[] = [];
  for (const user of people) {
    const info = due.get(user.id);
    if (!info) continue;
    const needsPlan =
      (info.what.milestone || info.what.checkin) &&
      user.habits.some((h) => h.kind === HabitKind.QUIT);
    if (needsPlan) {
      try {
        quitAllowedOf.set(user.id, (await canUseQuitHabits(user.id)).allowed);
      } catch (error) {
        await logger.error(
          "Habit presence failed for one person",
          {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        continue;
      }
    }
    dueUsers.push(user);
  }
  if (dueUsers.length === 0) return 0;
  const habitIds = dueUsers.flatMap((user) => user.habits.map((h) => h.id));
  const quitIds = dueUsers
    .filter(
      (user) =>
        due.get(user.id)?.what.milestone && quitAllowedOf.get(user.id) === true
    )
    .flatMap((user) =>
      user.habits.filter((h) => h.kind === HabitKind.QUIT).map((h) => h.id)
    );
  const reengageIds = dueUsers
    .filter((user) => due.get(user.id)?.what.reengage)
    .map((user) => user.id);
  const [completions, relapses, lastPushes] = await Promise.all([
    prisma.habitCompletion.findMany({
      where: { habitId: { in: habitIds }, date: { gte: since } },
      select: { habitId: true, date: true },
    }),
    quitIds.length > 0
      ? prisma.habitEvent.findMany({
          where: { habitId: { in: quitIds }, type: HabitEventType.RELAPSE },
          select: { habitId: true, type: true, at: true },
        })
      : Promise.resolve([]),
    reengageIds.length > 0
      ? prisma.habitPush.groupBy({
          by: ["userId"],
          where: { userId: { in: reengageIds }, kind: "reengage" },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const completionsOf = new Map<string, { date: Date }[]>();
  for (const row of completions) {
    completionsOf.set(row.habitId, [
      ...(completionsOf.get(row.habitId) ?? []),
      { date: row.date },
    ]);
  }
  const relapsesOf = new Map<string, { type: HabitEventType; at: Date }[]>();
  for (const row of relapses) {
    relapsesOf.set(row.habitId, [
      ...(relapsesOf.get(row.habitId) ?? []),
      { type: row.type, at: row.at },
    ]);
  }
  const lastReengageOf = new Map(
    lastPushes.map((row) => [row.userId, row._max.createdAt])
  );

  let pushed = 0;
  for (const user of dueUsers) {
    const info = due.get(user.id)!;
    try {
      pushed += await sweepUser(
        {
          ...user,
          habits: user.habits.map((habit) => ({
            ...habit,
            completions: completionsOf.get(habit.id) ?? [],
            events: relapsesOf.get(habit.id) ?? [],
          })),
        },
        info.prefs,
        info.settings,
        lastReengageOf.get(user.id) ?? null,
        now,
        quitAllowedOf.get(user.id) ?? false
      );
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
  return pushed;
}

async function sweepUser(
  user: UserRow,
  prefs: NotificationPrefs,
  settings: SettingsRow,
  lastReengageAt: Date | null,
  now: Date,
  /** Pro: without it the person's QUIT habits get nothing from here. */
  quitAllowed: boolean
) {
  const candidates = presenceCandidates({
    user,
    prefs,
    settings,
    lastReengageAt,
    now,
    quitAllowed,
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
