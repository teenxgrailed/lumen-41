import { personalBusyBlocks } from "@/services/personal-time/service";
import { resolveBusyFeedIds } from "@/services/scheduling/busy-feeds";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import {
  addCalendarDays,
  differenceInMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";
import { type WeekHours } from "@/lib/work-week";
import { loadWeekHours } from "@/lib/work-week-server";

type Window = { start: Date; end: Date };

function atTime(day: Date, time: string, timeZone?: string) {
  const [hour, minute] = time.split(":").map(Number);
  if (timeZone) {
    const date = formatInTimeZone(day, timeZone, "yyyy-MM-dd");
    return fromZonedTime(
      `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      timeZone
    );
  }
  const value = newDate(day);
  value.setHours(hour, minute, 0, 0);
  return value;
}

/**
 * The working windows of `days` calendar days from `rangeStart`, taken from
 * each weekday's own hours (a day that is off, or has two ranges, counts as
 * such). Days and hours are wall-clock in `timeZone` (the person's zone);
 * without it they are the process's local days.
 */
export function workingWindowsForRange(
  week: WeekHours,
  rangeStart: Date,
  days: number,
  timeZone?: string
): Window[] {
  return Array.from({ length: days }, (_, offset) => {
    const day = addCalendarDays(rangeStart, offset, timeZone);
    const weekday = timeZone
      ? Number(formatInTimeZone(day, timeZone, "i")) % 7
      : day.getDay();
    const entry = week.find((item) => item.day === weekday);
    return entry?.on
      ? entry.ranges.map((range) => ({
          start: atTime(day, range.start, timeZone),
          end: atTime(day, range.end, timeZone),
        }))
      : [];
  }).flat();
}

function occupiedMinutes(window: Window, busy: Window[]) {
  const intersections = busy
    .map((item) => ({
      start: item.start > window.start ? item.start : window.start,
      end: item.end < window.end ? item.end : window.end,
    }))
    .filter((item) => item.end > item.start)
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: Window[] = [];
  for (const item of intersections) {
    const previous = merged.at(-1);
    if (!previous || item.start > previous.end) merged.push({ ...item });
    else if (item.end > previous.end) previous.end = item.end;
  }
  return merged.reduce(
    (sum, item) => sum + differenceInMinutes(item.end, item.start),
    0
  );
}

export async function getScheduleCapacity(
  userId: string,
  workspace: WorkspaceAccess,
  days = 7
) {
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const timeZone = normalizeUserTimeZone(userSettings?.timeZone);
  const rangeStart = startOfDayInTimeZone(newDate(), timeZone);
  const rangeEnd = addCalendarDays(rangeStart, days, timeZone);
  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: {
      excludedCalendars: true,
    },
  });
  if (!settings) return null;

  const busyFeedIds = await resolveBusyFeedIds(
    userId,
    settings.excludedCalendars
  );
  const windows = workingWindowsForRange(
    await loadWeekHours(userId),
    rangeStart,
    days,
    timeZone
  );

  const [events, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        allDay: false,
        feedId: { in: busyFeedIds },
        feed: { userId, enabled: true },
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
        OR: [
          { description: null },
          { NOT: { description: { startsWith: "[NEEDT_DAY_BLOCK]" } } },
        ],
      },
      select: { start: true, end: true },
    }),
    prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(workspace, userId),
        isArchived: false,
        status: { not: "completed" },
        OR: [{ isAutoScheduled: true }, { autoScheduled: true }],
      },
      select: {
        estimatedMinutes: true,
        duration: true,
        scheduledStart: true,
        scheduledEnd: true,
      },
    }),
  ]);

  const workingMinutes = windows.reduce(
    (sum, window) => sum + differenceInMinutes(window.end, window.start),
    0
  );
  // Personal time is not free time: Lunch or a Walk takes the hour from tasks.
  const personal = await personalBusyBlocks(userId, rangeStart, rangeEnd);
  const eventWindows = [...events, ...personal].map((event) => ({
    start: event.start,
    end: event.end,
  }));
  const taskWindows = tasks.flatMap((task) =>
    task.scheduledStart && task.scheduledEnd
      ? [{ start: task.scheduledStart, end: task.scheduledEnd }]
      : []
  );
  const calendarBusyMinutes = windows.reduce(
    (sum, window) => sum + occupiedMinutes(window, eventWindows),
    0
  );
  const scheduledMinutes = windows.reduce(
    (sum, window) => sum + occupiedMinutes(window, taskWindows),
    0
  );
  const occupiedTotalMinutes = windows.reduce(
    (sum, window) =>
      sum + occupiedMinutes(window, [...eventWindows, ...taskWindows]),
    0
  );
  const demandMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? task.duration ?? 30),
    0
  );
  const availableMinutes = Math.max(0, workingMinutes - occupiedTotalMinutes);

  return {
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    workingMinutes,
    calendarBusyMinutes,
    scheduledMinutes,
    availableMinutes,
    demandMinutes,
    overflowMinutes: Math.max(
      0,
      demandMinutes - scheduledMinutes - availableMinutes
    ),
    utilization: workingMinutes
      ? Math.min(1, occupiedTotalMinutes / workingMinutes)
      : 1,
    privacy: "Calendar event titles and details are excluded.",
  };
}
