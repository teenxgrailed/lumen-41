/**
 * What `/api/connect/today`, `/api/connect/highlight` and
 * `/api/connect/habits/today` answer. One module so the three agree on what
 * "today" is: the day in the person's saved time zone (else UTC), never the
 * server's and never the caller's.
 */
import { loadPersonalOccurrences } from "@/services/personal-time/service";
import { cleanCity, weatherFor } from "@/services/weather/open-meteo";
import { WorkspaceKind } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import {
  addCalendarDays,
  fromZonedTime,
  newDate,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDateKey,
  habitDayKey,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { loadHighlight } from "../highlight/highlight-service";

const LOG_SOURCE = "ConnectToday";

export interface ConnectContext {
  userId: string;
  workspace: WorkspaceAccess;
}

export function taskHref(id: string) {
  return `/tasks?task=${encodeURIComponent(id)}`;
}

// ------------------------------------------------------------------ the day

export interface PersonDay {
  timeZone: string;
  /** "YYYY-MM-DD" of `now` in the person's zone. */
  date: string;
  /** Instant of the day's first and last-plus-one moment (DST-safe). */
  start: Date;
  end: Date;
  /** 0 = Sunday, in the person's zone. */
  weekday: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
}

export async function personDay(userId: string, now: Date): Promise<PersonDay> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true, weekStartDay: true },
  });
  return dayFor(now, settings?.timeZone, settings?.weekStartDay);
}

export function dayFor(
  now: Date,
  rawTimeZone: string | null | undefined,
  weekStartDay?: string | null
): PersonDay {
  const timeZone = normalizeUserTimeZone(rawTimeZone);
  const date = habitDayKey(now, timeZone);
  const start = startOfDayInTimeZone(now, timeZone);
  const end = startOfDayInTimeZone(addCalendarDays(now, 1, timeZone), timeZone);
  return {
    timeZone,
    date,
    start,
    end,
    weekday: habitDateFromKey(date).getUTCDay(),
    weekStartsOn: weekStartDay === "sunday" ? 0 : 1,
  };
}

/** The "YYYY-MM-DD" the person's week began on, for a day key. */
export function weekStartKey(dayKey: string, weekStartsOn: 0 | 1) {
  const day = habitDateFromKey(dayKey);
  const back = (day.getUTCDay() - weekStartsOn + 7) % 7;
  return habitDateKey(newDate(day.getTime() - back * 86_400_000));
}

// ------------------------------------------------------------------ highlight

export async function highlightView(
  { userId, workspace }: ConnectContext,
  date: string
) {
  const row = await loadHighlight(userId, workspace.workspaceId, date);
  if (!row || row.task.trashedAt) return null;
  const task = row.task;
  return {
    date: row.date,
    taskId: task.id,
    title: task.title,
    done: task.status === "completed",
    start: task.scheduledStart?.toISOString() ?? null,
    end: task.scheduledEnd?.toISOString() ?? null,
    durationMinutes: task.duration ?? task.estimatedMinutes ?? null,
    href: taskHref(task.id),
  };
}

// ------------------------------------------------------------------ habits

export interface HabitToday {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  /** "days" when pinned to weekdays, "weekly" for N times a week. */
  kind: "days" | "weekly";
  target: {
    perWeek: number;
    daysOfWeek: number[];
    quota: number | null;
    at: string | null;
  };
  /** Whether today is one of the habit's days (always true for "weekly"). */
  scheduledToday: boolean;
  doneToday: boolean;
  /** Check-ins today: 0 or 1, a habit day is kept or not. */
  todayCount: number;
  week: { start: string; done: number; target: number };
}

export async function habitsToday(
  { userId, workspace }: ConnectContext,
  day: PersonDay
): Promise<HabitToday[]> {
  const weekStart = weekStartKey(day.date, day.weekStartsOn);
  const rows = await prisma.habit.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      userId,
      archivedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      title: true,
      icon: true,
      color: true,
      daysOfWeek: true,
      targetOccurrencesPerWeek: true,
      quota: true,
      at: true,
      completions: {
        where: {
          date: {
            gte: habitDateFromKey(weekStart),
            lte: habitDateFromKey(day.date),
          },
        },
        select: { date: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => {
    const kept = new Set(row.completions.map((c) => habitDateKey(c.date)));
    const todayCount = kept.has(day.date) ? 1 : 0;
    const days = row.daysOfWeek ?? [];
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      color: row.color,
      kind: days.length ? "days" : "weekly",
      target: {
        perWeek: row.targetOccurrencesPerWeek,
        daysOfWeek: days,
        quota: row.quota,
        at: row.at,
      },
      scheduledToday: !days.length || days.includes(day.weekday),
      doneToday: todayCount > 0,
      todayCount,
      week: {
        start: weekStart,
        done: kept.size,
        target: row.targetOccurrencesPerWeek,
      },
    };
  });
}

// ------------------------------------------------------------------ free time

export interface Interval {
  start: Date;
  end: Date;
}

/** Minutes of [from, to) that no interval touches (overlaps count once). */
export function freeMinutesIn(
  from: Date,
  to: Date,
  busy: readonly Interval[]
): number {
  if (to <= from) return 0;
  const clipped = busy
    .map((b) => ({
      start: Math.max(b.start.getTime(), from.getTime()),
      end: Math.min(b.end.getTime(), to.getTime()),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let taken = 0;
  let cursor = from.getTime();
  for (const b of clipped) {
    const start = Math.max(b.start, cursor);
    if (b.end > start) {
      taken += b.end - start;
      cursor = b.end;
    }
  }
  return Math.max(
    0,
    Math.floor((to.getTime() - from.getTime() - taken) / 60_000)
  );
}

const HM = /^(\d{1,2}):(\d{2})$/;

/** The working window of `day` as instants, or null on a non-working day. */
export function workWindow(
  day: PersonDay,
  settings: {
    workingHoursEnabled: boolean;
    workingHoursStart: string;
    workingHoursEnd: string;
    workingHoursDays: string;
  } | null
): Interval | null {
  const enabled = settings?.workingHoursEnabled ?? true;
  let days = [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(settings?.workingHoursDays ?? "[1,2,3,4,5]");
    if (Array.isArray(parsed)) days = parsed.filter(Number.isInteger);
  } catch {
    // keep the default
  }
  const from = HM.exec(settings?.workingHoursStart ?? "09:00");
  const to = HM.exec(settings?.workingHoursEnd ?? "17:00");
  if (!enabled || !from || !to || !days.includes(day.weekday)) return null;
  const at = (m: RegExpExecArray) =>
    fromZonedTime(
      `${day.date}T${m[1].padStart(2, "0")}:${m[2]}:00`,
      day.timeZone
    );
  const window = { start: at(from), end: at(to) };
  return window.end > window.start ? window : null;
}

// ------------------------------------------------------------------ weather

export async function weatherLine(userId: string) {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { prefs: true },
    });
    const prefs =
      row?.prefs && typeof row.prefs === "object" && !Array.isArray(row.prefs)
        ? (row.prefs as Record<string, unknown>)
        : {};
    const city = cleanCity(prefs.city);
    if (!city) return null;
    const weather = await weatherFor(city);
    if (!weather) return null;
    return {
      ...weather,
      line: `${weather.temp}° ${weather.summary} in ${weather.city}`,
    };
  } catch (error) {
    logger.warn(
      "Weather unavailable for the widget",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
  }
}

// ------------------------------------------------------------------ today

interface TodayItem {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  durationMinutes: number | null;
  due: Date | null;
  overdue: boolean;
}

const OPEN_TASKS_CAP = 200;
const LIST_LENGTH = 6;

export async function todayView(ctx: ConnectContext, now: Date) {
  const { userId, workspace } = ctx;
  const day = await personDay(userId, now);
  const scope = workspaceDataScopeWhere(workspace, userId);
  const inDay = { gte: day.start, lt: day.end };
  const personal = workspace.workspaceKind === WorkspaceKind.PERSONAL;

  const [
    openRows,
    doneCount,
    highlight,
    habits,
    events,
    occurrences,
    calendarSettings,
    weather,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...scope,
        isArchived: false,
        trashedAt: null,
        habitId: null,
        status: { not: "completed" },
        OR: [
          { scheduledStart: inDay },
          { scheduledBlocks: { some: { start: inDay } } },
          { dueDate: { lt: day.end } },
        ],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        duration: true,
        estimatedMinutes: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduledBlocks: {
          where: { start: inDay },
          orderBy: { start: "asc" },
          select: { start: true, end: true },
        },
      },
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
      take: OPEN_TASKS_CAP,
    }),
    prisma.task.count({
      where: {
        ...scope,
        isArchived: false,
        trashedAt: null,
        habitId: null,
        status: "completed",
        completedAt: inDay,
      },
    }),
    highlightView(ctx, day.date),
    habitsToday(ctx, day),
    personal
      ? prisma.calendarEvent.findMany({
          where: {
            archivedAt: null,
            feed: { userId, enabled: true },
            end: { gt: now },
            start: { lt: addCalendarDays(now, 7, day.timeZone) },
          },
          select: {
            id: true,
            title: true,
            start: true,
            end: true,
            location: true,
            allDay: true,
            status: true,
          },
          orderBy: { start: "asc" },
          take: 40,
        })
      : Promise.resolve([]),
    loadPersonalOccurrences(userId, now, day.end),
    prisma.calendarSettings.findUnique({
      where: { userId },
      select: {
        workingHoursEnabled: true,
        workingHoursStart: true,
        workingHoursEnd: true,
        workingHoursDays: true,
      },
    }),
    weatherLine(userId),
  ]);

  const items: TodayItem[] = openRows.map((t) => {
    const blocks = t.scheduledBlocks;
    const inSlot =
      t.scheduledStart &&
      t.scheduledStart >= day.start &&
      t.scheduledStart < day.end;
    const start = blocks.length
      ? blocks[0].start
      : inSlot
        ? t.scheduledStart
        : null;
    const end = blocks.length
      ? blocks[blocks.length - 1].end
      : inSlot
        ? t.scheduledEnd
        : null;
    return {
      id: t.id,
      title: t.title,
      start,
      end,
      durationMinutes:
        t.duration ??
        t.estimatedMinutes ??
        (start && end
          ? Math.round((end.getTime() - start.getTime()) / 60_000)
          : null),
      due: t.dueDate,
      overdue: Boolean(t.dueDate && t.dueDate < day.start),
    };
  });
  // Only tasks with a slot today, a deadline today or past count as today's.
  const today = items.filter((i) => i.start || (i.due && i.due < day.end));
  // Running or upcoming slots first, then untimed (by deadline), then past slots.
  const rank = (i: TodayItem) =>
    i.start && (i.end ?? i.start) >= now ? 0 : !i.start ? 1 : 2;
  today.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = (a.start ?? a.due)?.getTime() ?? 0;
    const tb = (b.start ?? b.due)?.getTime() ?? 0;
    return ta - tb;
  });
  const view = (i: TodayItem) => ({
    id: i.id,
    title: i.title,
    start: i.start?.toISOString() ?? null,
    end: i.end?.toISOString() ?? null,
    durationMinutes: i.durationMinutes,
    due: i.due?.toISOString() ?? null,
    overdue: i.overdue,
    href: taskHref(i.id),
  });

  const timedEvents = events.filter((e) => e.status !== "cancelled");
  const event = timedEvents.find((e) => !e.allDay) ?? timedEvents[0] ?? null;
  const block = occurrences.find((o) => o.end > now) ?? null;

  // Free minutes: what is left of the working window after today's slots,
  // events and personal time. Nothing on a non-working day.
  const window = workWindow(day, calendarSettings);
  let freeMinutes = 0;
  if (window) {
    const busy: Interval[] = [
      ...items.flatMap((i) => (i.start && i.end ? [i as Interval] : [])),
      ...timedEvents
        .filter((e) => !e.allDay)
        .map((e) => ({ start: e.start, end: e.end })),
      ...occurrences.map((o) => ({ start: o.start, end: o.end })),
    ];
    freeMinutes = freeMinutesIn(
      window.start > now ? window.start : now,
      window.end,
      busy
    );
  }

  return {
    generatedAt: now.toISOString(),
    timeZone: day.timeZone,
    date: day.date,
    counts: {
      open: today.length,
      done: doneCount,
      total: today.length + doneCount,
    },
    next: today[0] ? view(today[0]) : null,
    tasks: today.slice(0, LIST_LENGTH).map(view),
    highlight,
    habits,
    event: event
      ? {
          id: event.id,
          title: event.title,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
          location: event.location,
          allDay: event.allDay,
        }
      : null,
    personalBlock: block
      ? {
          blockId: block.blockId,
          kind: block.kind,
          title: block.title,
          emoji: block.emoji,
          start: block.start.toISOString(),
          end: block.end.toISOString(),
        }
      : null,
    freeMinutes,
    weather,
  };
}
