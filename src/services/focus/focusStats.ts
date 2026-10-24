import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import {
  type FocusSession,
  FocusSessionMode,
  FocusSessionPhase,
  TimeEntrySource,
} from "@prisma/client";

import { addDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  FocusTaskNotFoundError,
  type FocusTaskScope,
  scopedTaskId,
} from "./task-scope";

export interface WeeklyFocusReport {
  focusMinutes: number;
  sessionsCompleted: number;
  /** Focus sessions that put minutes in the week, ended early or not. */
  sessionsFocused: number;
  bestDay: string | null;
  estimateAccuracyPercent: number | null;
  /** Focused minutes per day for the last 7 days, oldest first (bar chart). */
  dailyMinutes: { label: string; minutes: number }[];
  streakStatus: {
    current: number;
    longest: number;
    atRisk: boolean;
  };
}

/** An early-ended session shorter than this does not keep a streak alive. */
const STREAK_MIN_MINUTES = 5;

type Counted = Pick<
  FocusSession,
  "phase" | "endedAt" | "elapsedMinutes" | "completed"
>;

/**
 * A session that put minutes into the person's day: an ended focus session,
 * whether its clock ran out or they stopped it early. Breaks never count, and
 * neither does one still running.
 */
export function isFocusMinutes(session: Counted): boolean {
  return (
    session.endedAt != null &&
    session.phase === FocusSessionPhase.FOCUS &&
    session.elapsedMinutes > 0
  );
}

/** Whether the day it was on counts toward the streak. */
export function keepsStreak(session: Counted): boolean {
  return (
    isFocusMinutes(session) &&
    (session.completed || session.elapsedMinutes >= STREAK_MIN_MINUTES)
  );
}

function localDayKey(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

function daysBetweenKeys(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
  );
}

function scoreFrom(input: {
  focusGoalRatio: number;
  completed: number;
  abandoned: number;
  accuracy: number;
  currentStreak: number;
}): number {
  const completionScore =
    input.completed + input.abandoned === 0
      ? 0
      : input.completed / (input.completed + input.abandoned);
  const streakScore = Math.min(1, input.currentStreak / 7);
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Math.min(1, input.focusGoalRatio) * 35 +
          completionScore * 30 +
          input.accuracy * 20 +
          streakScore * 15
      )
    )
  );
}

async function estimateAccuracy(userId: string): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      actualMinutes: { gt: 0 },
      estLikely: { gt: 0 },
    },
    select: { actualMinutes: true, estLikely: true },
    take: 50,
    orderBy: { completedAt: "desc" },
  });

  if (tasks.length === 0) return 0.5;

  const averageError =
    tasks.reduce((total, task) => {
      const actual = task.actualMinutes ?? 0;
      const likely = task.estLikely ?? 1;
      return total + Math.min(1, Math.abs(actual - likely) / likely);
    }, 0) / tasks.length;

  return Math.max(0, 1 - averageError);
}

export async function recordFocusSession(input: {
  userId: string;
  taskId?: string | null;
  /** Required so no caller can book time on a task it never checked. */
  taskScope: FocusTaskScope;
  mode: FocusSessionMode;
  plannedMinutes?: number | null;
  elapsedMinutes: number;
  completed: boolean;
  abandoned?: boolean;
  startedAt: Date;
  endedAt: Date;
}) {
  let taskId: string | null = null;
  if (input.taskId) {
    taskId = await scopedTaskId(input.taskId, input.taskScope);
    if (!taskId) throw new FocusTaskNotFoundError();
  }

  const session = await prisma.focusSession.create({
    data: {
      userId: input.userId,
      taskId,
      mode: input.mode,
      plannedMinutes: input.plannedMinutes ?? null,
      elapsedMinutes: input.elapsedMinutes,
      completed: input.completed,
      abandoned: Boolean(input.abandoned),
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    },
  });

  if (taskId && input.elapsedMinutes > 0) {
    await prisma.timeEntry.create({
      data: {
        taskId,
        userId: input.userId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        source: TimeEntrySource.focus,
      },
    });
    await recomputeTaskActuals(taskId);
  }

  await recomputeFocusStats(input.userId);
  return session;
}

export async function recomputeFocusStats(userId: string) {
  const [sessions, accuracy, preferences, settings] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId },
      orderBy: { startedAt: "asc" },
    }),
    estimateAccuracy(userId),
    prisma.focusPreferences.findUnique({ where: { userId } }),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
  ]);
  const timeZone = settings?.timeZone || "UTC";

  const focus = sessions.filter(
    (session) => session.phase === FocusSessionPhase.FOCUS
  );
  const completed = focus.filter((session) => session.completed);
  const abandoned = focus.filter((session) => session.abandoned).length;
  const counted = sessions.filter(isFocusMinutes);
  const lifetimeMinutes = counted.reduce(
    (total, session) => total + session.elapsedMinutes,
    0
  );

  const uniqueDays = Array.from(
    new Set(
      sessions
        .filter(keepsStreak)
        .map((session) => localDayKey(session.startedAt, timeZone))
    )
  ).sort();

  let longestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of uniqueDays) {
    run = previous && daysBetweenKeys(day, previous) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }

  const lastFocusDate = uniqueDays.length
    ? newDate(`${uniqueDays[uniqueDays.length - 1]}T12:00:00Z`)
    : null;
  const currentStreak =
    uniqueDays.length &&
    daysBetweenKeys(localDayKey(newDate(), timeZone), uniqueDays.at(-1)!) <= 1
      ? run
      : 0;
  const sevenDayCutoff = addDays(newDate(), -7);
  const recentMinutes = counted
    .filter((session) => session.startedAt >= sevenDayCutoff)
    .reduce((total, session) => total + session.elapsedMinutes, 0);
  const focusGoalRatio =
    recentMinutes / Math.max(1, (preferences?.dailyGoalMinutes ?? 25) * 7);
  const focusScore = scoreFrom({
    focusGoalRatio,
    completed: completed.length,
    abandoned,
    accuracy,
    currentStreak,
  });

  return prisma.focusStats.upsert({
    where: { userId },
    create: {
      userId,
      focusScore,
      currentStreak,
      longestStreak,
      lifetimeMinutes,
      lastFocusDate,
    },
    update: {
      focusScore,
      currentStreak,
      longestStreak,
      lifetimeMinutes,
      lastFocusDate,
    },
  });
}

export async function getWeeklyFocusReport(
  userId: string
): Promise<WeeklyFocusReport> {
  // A day wider than the window, so the person's zone never cuts its edge.
  const since = addDays(newDate(), -8);

  const [sessions, stats, accuracy, settings] = await Promise.all([
    prisma.focusSession.findMany({
      where: { userId, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.focusStats.findUnique({ where: { userId } }),
    estimateAccuracy(userId),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
  ]);
  const timeZone = settings?.timeZone || "UTC";

  const completed = sessions.filter(
    (session) => session.completed && session.phase === FocusSessionPhase.FOCUS
  );
  const counted = sessions.filter(isFocusMinutes);
  const minutesByDay = new Map<string, number>();
  for (const session of counted) {
    const key = formatInTimeZone(session.startedAt, timeZone, "EEE");
    minutesByDay.set(
      key,
      (minutesByDay.get(key) ?? 0) + session.elapsedMinutes
    );
  }

  const bestDay =
    [...minutesByDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lastFocusDate = stats?.lastFocusDate ?? null;

  const todayKey = localDayKey(newDate(), timeZone);
  // Fixed 7-day window (oldest first) so the bar chart always has 7 columns,
  // including days with no focus.
  const dailyMinutes: { label: string; minutes: number }[] = [];
  const minutesByDayKey = new Map<string, number>();
  for (const session of counted) {
    const key = localDayKey(session.startedAt, timeZone);
    minutesByDayKey.set(
      key,
      (minutesByDayKey.get(key) ?? 0) + session.elapsedMinutes
    );
  }
  for (let offset = 6; offset >= 0; offset -= 1) {
    // Calendar days of the person's own zone, anchored at noon UTC so a
    // server in another zone (or a DST change) never shifts the day.
    const day = newDate(
      Date.parse(`${todayKey}T12:00:00Z`) - offset * 86_400_000
    );
    dailyMinutes.push({
      label: formatInTimeZone(day, "UTC", "EEEEE"),
      minutes:
        minutesByDayKey.get(formatInTimeZone(day, "UTC", "yyyy-MM-dd")) ?? 0,
    });
  }

  return {
    focusMinutes: counted.reduce(
      (total, session) => total + session.elapsedMinutes,
      0
    ),
    sessionsCompleted: completed.length,
    sessionsFocused: counted.length,
    bestDay,
    dailyMinutes,
    estimateAccuracyPercent: Math.round(accuracy * 100),
    streakStatus: {
      current: stats?.currentStreak ?? 0,
      longest: stats?.longestStreak ?? 0,
      atRisk: lastFocusDate
        ? daysBetweenKeys(
            localDayKey(newDate(), timeZone),
            localDayKey(lastFocusDate, timeZone)
          ) === 1
        : false,
    },
  };
}
