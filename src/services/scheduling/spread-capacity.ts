import { personalBusyBlocks } from "@/services/personal-time/service";
import {
  blockingEventWhere,
  pushedBlockExternalIds,
  resolveBusyFeedIds,
} from "@/services/scheduling/busy-feeds";
import {
  occupiedMinutes,
  workingWindowsForRange,
} from "@/services/scheduling/capacity";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import {
  addCalendarDays,
  differenceInMinutes,
  formatInTimeZone,
  fromZonedTime,
} from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { loadWeekHours } from "@/lib/work-week-server";

import { type SpreadDay, spreadMinutes, taskDayInZone } from "./spread";

type Window = { start: Date; end: Date };

/**
 * Working minutes of `windows` from `from` on, less what `busy` covers. A
 * window that ended before `from` gives nothing; one running gives its rest.
 */
export function freeWorkingMinutes(
  windows: readonly Window[],
  busy: readonly Window[],
  from: Date
) {
  return windows.reduce((sum, window) => {
    const start = window.start > from ? window.start : from;
    if (window.end <= start) return sum;
    const clipped = { start, end: window.end };
    return (
      sum +
      differenceInMinutes(clipped.end, clipped.start) -
      occupiedMinutes(clipped, [...busy])
    );
  }, 0);
}

/**
 * Room per day for a spread, `days` calendar days from `today` in the
 * person's zone: each day's own working hours (from `now` on for today), less
 * blocking events and personal time, less the open tasks already on that day
 * (`exclude` are the ones being spread, so they do not count against
 * themselves). A day off has no room.
 */
export async function loadSpreadDays(input: {
  userId: string;
  workspace: WorkspaceAccess;
  timeZone: string;
  today: string;
  days: number;
  now: Date;
  exclude: ReadonlySet<string>;
}): Promise<SpreadDay[]> {
  const { userId, timeZone, today, days, now } = input;
  const rangeStart = fromZonedTime(`${today}T00:00:00`, timeZone);
  const rangeEnd = addCalendarDays(rangeStart, days, timeZone);
  const dayKey = (date: Date) => formatInTimeZone(date, timeZone, "yyyy-MM-dd");

  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: { excludedCalendars: true },
  });
  const busyFeedIds = await resolveBusyFeedIds(
    userId,
    settings?.excludedCalendars
  );
  const [week, eventRows, pushedBlockIds, personal, tasks] = await Promise.all([
    loadWeekHours(userId),
    prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        allDay: false,
        ...blockingEventWhere,
        feedId: { in: busyFeedIds },
        feed: { userId, enabled: true },
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
        OR: [
          { description: null },
          { NOT: { description: { startsWith: "[NEEDT_DAY_BLOCK]" } } },
        ],
      },
      select: { start: true, end: true, externalEventId: true },
    }),
    pushedBlockExternalIds(userId),
    personalBusyBlocks(userId, rangeStart, rangeEnd),
    prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(input.workspace, userId),
        id: { notIn: [...input.exclude] },
        isArchived: false,
        noSlot: false,
        status: { not: "completed" },
        OR: [
          { dueDate: { gte: rangeStart, lt: rangeEnd } },
          { scheduledStart: { gte: rangeStart, lt: rangeEnd } },
        ],
      },
      select: {
        dueDate: true,
        scheduledStart: true,
        estimatedMinutes: true,
        duration: true,
      },
    }),
  ]);

  // An event that echoes a task block we pushed is the task, not busy time.
  const busy: Window[] = [
    ...eventRows.filter(
      (event) =>
        !event.externalEventId || !pushedBlockIds.has(event.externalEventId)
    ),
    ...personal,
  ].map((item) => ({ start: item.start, end: item.end }));

  const windowsByDay = new Map<string, Window[]>();
  for (const window of workingWindowsForRange(
    week,
    rangeStart,
    days,
    timeZone
  )) {
    const key = dayKey(window.start);
    windowsByDay.set(key, [...(windowsByDay.get(key) ?? []), window]);
  }

  const loadByDay = new Map<string, number>();
  for (const task of tasks) {
    const day = taskDayInZone(task, today, timeZone);
    if (!day) continue;
    loadByDay.set(day, (loadByDay.get(day) ?? 0) + spreadMinutes(task));
  }

  return Array.from({ length: days }, (_, offset) => {
    const date = dayKey(addCalendarDays(rangeStart, offset, timeZone));
    const windows = windowsByDay.get(date) ?? [];
    const free = windows.length
      ? freeWorkingMinutes(windows, busy, now) - (loadByDay.get(date) ?? 0)
      : 0;
    return { date, free };
  });
}
