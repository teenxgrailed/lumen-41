import { Prisma, ProactiveNudgeType } from "@prisma/client";

import { formatInTimeZone, fromZonedTime } from "@/lib/date-utils";
import { canUseAdvancedNudges } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { describeGap, longestFreeGap } from "./free-time";

type NudgeDraft = {
  taskId?: string;
  type: ProactiveNudgeType;
  timeWindow: string;
  title: string;
  body: string;
  deepLink: string;
};

function inQuietHours(
  now: Date,
  timeZone: string,
  start?: string | null,
  end?: string | null
) {
  if (!start || !end) return false;
  const time = formatInTimeZone(now, timeZone, "HH:mm");
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}

/** Work days from the settings string; unset or unreadable is Monday to Friday. */
function workDaysOf(value: string | null | undefined): number[] {
  if (!value) return [1, 2, 3, 4, 5];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6
        )
      : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

/**
 * "2 hours opened up": the longest stretch of what is left of today's work
 * hours that no calendar event or placed task touches, while open tasks still
 * have no time. Without those tasks "Fill it" would have nothing to place, so
 * nothing is said.
 */
async function freeTimeDraft(
  userId: string,
  timeZone: string,
  now: Date,
  dayWindow: string
): Promise<NudgeDraft | null> {
  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: { workDays: true, workHourStart: true, workHourEnd: true },
  });
  if (!settings || settings.workHourEnd <= settings.workHourStart) return null;
  const weekday = Number(formatInTimeZone(now, timeZone, "i")) % 7;
  if (!workDaysOf(settings.workDays).includes(weekday)) return null;

  const at = (hour: number) =>
    fromZonedTime(
      `${dayWindow}T${String(hour).padStart(2, "0")}:00:00`,
      timeZone
    ).getTime();
  // Start on the next quarter hour: a gap that began a minute ago is not news.
  const quarter = 15 * 60_000;
  const from = Math.max(
    at(settings.workHourStart),
    Math.ceil(now.getTime() / quarter) * quarter
  );
  const window = { start: from, end: at(settings.workHourEnd) };
  if (window.end <= window.start) return null;

  const unplaced = await prisma.task.count({
    where: {
      userId,
      isArchived: false,
      status: { not: "completed" },
      scheduledStart: null,
    },
  });
  if (unplaced === 0) return null;

  const [events, placed] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        allDay: false,
        feed: { userId, enabled: true },
        start: { lt: new Date(window.end) },
        end: { gt: new Date(window.start) },
      },
      select: { start: true, end: true },
      take: 200,
    }),
    prisma.task.findMany({
      where: {
        userId,
        isArchived: false,
        status: { not: "completed" },
        scheduledStart: { lt: new Date(window.end) },
        scheduledEnd: { gt: new Date(window.start) },
      },
      select: { scheduledStart: true, scheduledEnd: true },
      take: 200,
    }),
  ]);
  const busy = [
    ...events.map((e) => ({ start: e.start.getTime(), end: e.end.getTime() })),
    ...placed.flatMap((t) =>
      t.scheduledStart && t.scheduledEnd
        ? [
            {
              start: t.scheduledStart.getTime(),
              end: t.scheduledEnd.getTime(),
            },
          ]
        : []
    ),
  ];
  const gap = longestFreeGap(window, busy);
  if (!gap) return null;
  const { range, hours } = describeGap(gap, (ms) =>
    formatInTimeZone(new Date(ms), timeZone, "HH:mm")
  );
  return {
    type: ProactiveNudgeType.FREE_TIME,
    timeWindow: dayWindow,
    title: `${hours} hours opened up`,
    body: `${range} today is free, and ${unplaced} ${unplaced === 1 ? "task has" : "tasks have"} no time yet.`,
    deepLink: "/today",
  };
}

export async function generateProactiveNudges(now = new Date()) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      userSettings: { select: { timeZone: true } },
      focusPreferences: {
        select: { quietHoursStart: true, quietHoursEnd: true },
      },
    },
  });
  let created = 0;
  for (const user of users) {
    const timeZone = user.userSettings?.timeZone || "UTC";
    if (
      inQuietHours(
        now,
        timeZone,
        user.focusPreferences?.quietHoursStart,
        user.focusPreferences?.quietHoursEnd
      )
    ) {
      continue;
    }
    const dayWindow = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
    const drafts: NudgeDraft[] = [];
    const latestOverflowRun = await prisma.schedulingRun.findFirst({
      where: {
        userId: user.id,
        finishedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        unscheduled: { not: Prisma.DbNull },
      },
      orderBy: { finishedAt: "desc" },
      select: { id: true, unscheduled: true },
    });
    if (
      latestOverflowRun &&
      Array.isArray(latestOverflowRun.unscheduled) &&
      latestOverflowRun.unscheduled.length > 0
    ) {
      drafts.push({
        type: ProactiveNudgeType.OVERBOOKED_DAY,
        timeWindow: dayWindow,
        title: "Your plan is over capacity",
        body: `${latestOverflowRun.unscheduled.length} task${latestOverflowRun.unscheduled.length === 1 ? "" : "s"} could not fit.`,
        deepLink: `/today?run=${latestOverflowRun.id}`,
      });
    }

    const entitlement = await canUseAdvancedNudges(user.id);
    if (entitlement.allowed) {
      const free = await freeTimeDraft(user.id, timeZone, now, dayWindow);
      if (free) drafts.push(free);
      const tasks = await prisma.task.findMany({
        where: {
          userId: user.id,
          isArchived: false,
          status: { not: "completed" },
          OR: [
            { deadline: { not: null } },
            { dueDate: { not: null } },
            { scheduledStart: { not: null } },
          ],
        },
        select: {
          id: true,
          title: true,
          deadline: true,
          dueDate: true,
          scheduledStart: true,
          scheduledEnd: true,
          estimatedMinutes: true,
          duration: true,
          focusSessions: {
            where: {
              startedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
            },
            select: { id: true },
            take: 1,
          },
        },
        take: 250,
      });
      for (const task of tasks) {
        const deadline = task.deadline ?? task.dueDate;
        if (deadline && deadline < now) {
          drafts.push({
            taskId: task.id,
            type: ProactiveNudgeType.OVERDUE_TASK,
            timeWindow: dayWindow,
            title: "Task overdue",
            body: task.title,
            deepLink: `/today?task=${task.id}`,
          });
        } else if (
          deadline &&
          (task.estimatedMinutes ?? task.duration ?? 30) * 60_000 >
            deadline.getTime() - now.getTime()
        ) {
          drafts.push({
            taskId: task.id,
            type: ProactiveNudgeType.DEADLINE_UNREACHABLE,
            timeWindow: dayWindow,
            title: "Deadline at risk",
            body: `“${task.title}” needs more time than remains.`,
            deepLink: `/today?task=${task.id}`,
          });
        }
        if (
          task.scheduledStart &&
          task.scheduledStart < new Date(now.getTime() - 15 * 60_000) &&
          task.scheduledEnd &&
          task.scheduledEnd > new Date(now.getTime() - 24 * 60 * 60_000) &&
          task.focusSessions.length === 0
        ) {
          drafts.push({
            taskId: task.id,
            type: ProactiveNudgeType.MISSED_FOCUS,
            timeWindow: `${dayWindow}:${formatInTimeZone(task.scheduledStart, timeZone, "HH")}`,
            title: "Start the focus block?",
            body: task.title,
            deepLink: `/focus?task=${task.id}`,
          });
        }
      }
    }

    for (const draft of drafts) {
      const dedupeKey = [
        draft.taskId ?? "day",
        draft.type,
        draft.timeWindow,
      ].join(":");
      const result = await prisma.proactiveNudge.createMany({
        data: [{ userId: user.id, dedupeKey, ...draft }],
        skipDuplicates: true,
      });
      created += result.count;
    }
  }
  return { created };
}
