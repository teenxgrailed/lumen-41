import { runOp } from "@/services/ops";
import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";
import {
  blockingEventWhere,
  pushedBlockExternalIds,
  resolveBusyFeedIds,
} from "@/services/scheduling/busy-feeds";
import {
  type Prisma,
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  TaskReminderKind,
} from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import { canCreateHabit } from "@/lib/entitlements";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkSchedule } from "@/lib/work-schedules";
import { type WeekHours } from "@/lib/work-week";
import { saveWeekHours } from "@/lib/work-week-server";

import { type OnboardingAnswers, onboardingAnswersSchema } from "./answers";
import { areaById } from "./catalog";
import { hhmm } from "./format";
import {
  type PlanEvent,
  type WeekPlan,
  nextWeekStart,
  planWeek,
  scheduleName,
  scheduleTable,
  toEngineDay,
} from "./plan";

const LOG_SOURCE = "OnboardingService";
export const ONBOARDING_SOURCE = "onboarding";

const FEED_NAMES: Record<string, string> = {
  GOOGLE: "Google Calendar",
  OUTLOOK: "Outlook",
  CALDAV: "iCloud Calendar",
};

/**
 * The person's real calendar for the week being planned, or null when no
 * calendar is connected (then the plan uses the sample calendar and says so).
 * Same filters the account's own scheduler uses: enabled feeds, no all-day,
 * no free/declined, no echoes of task blocks we pushed.
 */
export async function loadWeekEvents(
  userId: string,
  weekStart: Date,
  timeZone: string
): Promise<{ events: PlanEvent[]; calendarName: string } | null> {
  const feeds = await prisma.calendarFeed.findMany({
    where: { userId, enabled: true, type: { not: "LOCAL" } },
    select: { type: true },
  });
  if (feeds.length === 0) return null;
  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: { excludedCalendars: true },
  });
  const feedIds = await resolveBusyFeedIds(userId, settings?.excludedCalendars);
  const weekEnd = addCalendarDays(weekStart, 7, timeZone);
  const pushed = await pushedBlockExternalIds(userId);
  const rows = await prisma.calendarEvent.findMany({
    where: {
      archivedAt: null,
      allDay: false,
      ...blockingEventWhere,
      feedId: { in: feedIds },
      feed: { userId, enabled: true },
      start: { lt: weekEnd },
      end: { gt: weekStart },
    },
    select: {
      title: true,
      start: true,
      end: true,
      externalEventId: true,
    },
    orderBy: { start: "asc" },
    take: 500,
  });
  const events: PlanEvent[] = [];
  for (const row of rows) {
    if (row.externalEventId && pushed.has(row.externalEventId)) continue;
    for (let day = 0; day < 7; day++) {
      const dayStart = addCalendarDays(weekStart, day, timeZone);
      const dayEnd = addCalendarDays(weekStart, day + 1, timeZone);
      if (row.end <= dayStart || row.start >= dayEnd) continue;
      const hourOf = (d: Date) => {
        const [h, m] = formatInTimeZone(d, timeZone, "HH:mm")
          .split(":")
          .map(Number);
        return h + m / 60;
      };
      events.push({
        day,
        start: row.start > dayStart ? hourOf(row.start) : 0,
        end: row.end < dayEnd ? hourOf(row.end) : 24,
        title: row.title.slice(0, 60),
      });
    }
  }
  const names = [
    ...new Set(feeds.map((f) => FEED_NAMES[f.type] ?? "Calendar")),
  ];
  return { events, calendarName: names.join(" and ") };
}

/** The plan for these answers: the real calendar when signed in with one. */
export async function previewWeek(input: {
  answers: OnboardingAnswers;
  userId: string | null;
  timeZone: string;
  seed?: number;
  now?: Date;
}): Promise<WeekPlan> {
  const timeZone = normalizeUserTimeZone(input.timeZone);
  const now = input.now ?? newDate();
  const real = input.userId
    ? await loadWeekEvents(input.userId, nextWeekStart(now, timeZone), timeZone)
    : null;
  return planWeek({
    answers: input.answers,
    events: real?.events ?? null,
    calendarName: real?.calendarName ?? null,
    timeZone,
    seed: input.seed,
    now,
  });
}

export async function readSavedAnswers(
  userId: string
): Promise<OnboardingAnswers | null> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { onboarding: true },
  });
  if (!row?.onboarding) return null;
  const parsed = onboardingAnswersSchema.safeParse(row.onboarding);
  return parsed.success ? parsed.data : null;
}

export async function saveAnswers(
  userId: string,
  answers: OnboardingAnswers,
  timeZone: string
) {
  const json = answers as unknown as Prisma.InputJsonValue;
  await prisma.userSettings.upsert({
    where: { userId },
    update: { onboarding: json },
    create: {
      userId,
      timeZone: normalizeUserTimeZone(timeZone),
      onboarding: json,
    },
  });
}

const dayStartOf = (weekStart: Date, d: number, tz: string) =>
  addCalendarDays(weekStart, d, tz);

function weekHoursOf(a: OnboardingAnswers): WeekHours {
  const clamp = (h: number) => hhmm(Math.min(23.5, h));
  const table = scheduleTable(a);
  return Array.from({ length: 7 }, (_, day) => {
    const d = (day + 6) % 7; // engine Sunday-first -> design Monday-first
    const on = a.workdays.includes(d);
    const [s, e] = table.hoursOf(d);
    return {
      day,
      on,
      ranges: on ? [{ start: clamp(s), end: clamp(e) }] : [],
    };
  });
}

export interface CommitResult {
  weekStart: string;
  tasks: number;
  habits: number;
  /** Habits the plan did not allow; their weeks were written as plain tasks. */
  habitsAsTasks: number;
  projects: number;
  /** Placed by the account's own scheduler after the write. */
  placed: number;
  unplaced: number;
  lunch: boolean;
}

/**
 * Writes the first week for real: settings, work schedules, projects, habits
 * and tasks, then runs the account's own scheduler over them. Safe to run
 * again: rows an earlier run made (source "onboarding", still open) are
 * replaced, nothing else is touched.
 */
export async function commitOnboarding(input: {
  userId: string;
  workspace: WorkspaceAccess;
  answers: OnboardingAnswers;
  timeZone: string;
  now?: Date;
}): Promise<CommitResult> {
  const { userId, workspace, answers: a } = input;
  const now = input.now ?? newDate();
  const timeZone = normalizeUserTimeZone(input.timeZone);
  const weekStart = nextWeekStart(now, timeZone);
  const plan = await previewWeek({ answers: a, userId, timeZone, now });
  const table = scheduleTable(a);
  const workspaceId = workspace.workspaceId;

  await saveAnswers(userId, a, timeZone);
  const stored = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  if (!stored?.timeZone || ["UTC", "Etc/UTC"].includes(stored.timeZone)) {
    await prisma.userSettings.update({
      where: { userId },
      data: { timeZone },
    });
  }

  /* Work hours: the default schedule, then one per kind and part of day. */
  await saveWeekHours(userId, weekHoursOf(a));
  const defaultSchedule = await ensureDefaultWorkSchedule(prisma, userId);
  const scheduleIds = new Map<string, string>();
  scheduleIds.set("work:", defaultSchedule.id);
  const ensureSchedule = async (
    kind: "work" | "life",
    part: "" | "m" | "a" | "e"
  ) => {
    const key = `${kind}:${part}`;
    const known = scheduleIds.get(key);
    if (known) return known;
    const map = table.byKey[key] ?? {};
    const name = scheduleName(kind, part);
    const windows = Object.entries(map).map(([day, w]) => ({
      dayOfWeek: Number(day),
      startTime: w.start,
      endTime: w.end,
      sortOrder: 0,
    }));
    const existing = await prisma.workSchedule.findFirst({
      where: { userId, name },
      select: { id: true },
    });
    const row = existing
      ? await prisma.workSchedule.update({
          where: { id: existing.id },
          data: {
            windows: { deleteMany: {}, create: windows },
          },
          select: { id: true },
        })
      : await prisma.workSchedule.create({
          data: {
            userId,
            name,
            timeZone,
            isDefault: false,
            windows: { create: windows },
          },
          select: { id: true },
        });
    scheduleIds.set(key, row.id);
    return row.id;
  };

  await prisma.schedulingPreferences.upsert({
    where: { userId },
    update: {
      bufferMinutes: a.buffer,
      minBreakMinutes: Math.min(15, a.buffer),
      hardStopTime: hhmm(Math.min(23.5, table.latestEnd)),
    },
    create: {
      userId,
      bufferMinutes: a.buffer,
      minBreakMinutes: Math.min(15, a.buffer),
      hardStopTime: hhmm(Math.min(23.5, table.latestEnd)),
    },
  });
  await prisma.autoScheduleSettings.updateMany({
    where: { userId },
    data: { bufferMinutes: a.buffer },
  });

  /* Lunch is protected time, the way Settings -> Your day keeps it. */
  let lunch = false;
  if (a.lunch) {
    try {
      await runOp(
        "personal.set_default",
        {
          kind: "lunch",
          enabled: true,
          at: "12:00",
          minutes: 60,
          days: table.days.map(toEngineDay),
        },
        { userId, workspace, actor: "user" }
      );
      lunch = true;
    } catch (error) {
      logger.warn(
        "Lunch default could not be written",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  }

  /* Reminders. */
  await prisma.notificationSettings.upsert({
    where: { userId },
    update: { dailyPlan: a.reminders === "brief" },
    create: { userId, dailyPlan: a.reminders === "brief" },
  });

  /* Earlier onboarding rows that are still open are ours to replace. */
  const old = { userId, source: ONBOARDING_SOURCE, status: "todo" };
  await prisma.task.deleteMany({ where: { ...old, workspaceId } });

  /* One project per area, in the area's own colour. */
  const projectIds = new Map<string, string>();
  for (const id of a.areas) {
    const area = areaById(id);
    if (!area) continue;
    const found = await prisma.project.findFirst({
      where: { workspaceId, name: area.name, status: "active" },
      select: { id: true },
    });
    const project =
      found ??
      (await prisma.project.create({
        data: {
          name: area.name,
          color: area.color,
          userId,
          workspaceId,
          status: "active",
        },
        select: { id: true },
      }));
    projectIds.set(id, project.id);
  }

  let tasks = 0;
  let habits = 0;
  let habitsAsTasks = 0;
  const reminderRows: Prisma.TaskReminderCreateManyInput[] = [];
  const room = await canCreateHabit(userId);
  let habitSlots = room.remaining === null ? Infinity : room.remaining;

  for (const t of plan.tasks) {
    const scheduleId = await ensureSchedule(t.kind, t.part);
    const common = {
      title: t.title,
      status: "todo",
      duration: t.minutes,
      estimatedMinutes: t.minutes,
      maxChunkMinutes: a.maxBlock,
      energyRequired: t.focusy
        ? SchedulingEnergyLevel.HIGH
        : SchedulingEnergyLevel.MEDIUM,
      priorityLevel: t.priority as SchedulingTaskPriority,
      userId,
      workspaceId,
      assigneeId: userId,
      scheduleId,
      projectId: projectIds.get(t.area) ?? null,
      autoScheduled: true,
      isAutoScheduled: true,
      source: ONBOARDING_SOURCE,
    };
    let habitId: string | null = null;
    if (t.habit && habitSlots > 0) {
      const habit = await prisma.habit.create({
        data: {
          userId,
          workspaceId,
          title: t.title,
          targetOccurrencesPerWeek: Math.min(7, Math.max(1, t.n)),
          daysOfWeek: [...new Set(t.targets.map(toEngineDay))].sort(),
          estimatedMinutes: t.minutes,
          energyRequired: common.energyRequired,
          priority: common.priorityLevel,
          scheduleId,
          projectId: common.projectId,
          color: areaById(t.area)?.color ?? null,
        },
        select: { id: true },
      });
      habitId = habit.id;
      habitSlots -= 1;
      habits += 1;
    } else if (t.habit) habitsAsTasks += 1;

    for (const target of t.targets) {
      const start = dayStartOf(weekStart, target, timeZone);
      const created = await prisma.task.create({
        data: {
          ...common,
          availableFrom: start,
          ...(t.habit
            ? { deadline: dayStartOf(weekStart, target + 1, timeZone) }
            : {}),
          ...(habitId ? { habitId, habitOccurrenceAt: start } : {}),
        },
        select: { id: true },
      });
      tasks += 1;
      if (a.reminders !== "brief") {
        reminderRows.push({
          userId,
          taskId: created.id,
          kind: TaskReminderKind.BEFORE_START,
          offsetMinutes: a.reminders === "5" ? 5 : 0,
          channels: ["push", "email"],
        });
      }
    }
  }
  if (reminderRows.length)
    await prisma.taskReminder.createMany({
      data: reminderRows,
      skipDuplicates: true,
    });

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingUses: a.areas, onboardingCompletedAt: now },
  });

  /* The account's own scheduler places what was written. */
  let placed = 0;
  let unplaced = 0;
  try {
    await scheduleAllTasksForUserDetailed(userId, { workspaceId });
    const end = addCalendarDays(weekStart, 7, timeZone);
    const mine = await prisma.task.findMany({
      where: { userId, workspaceId, source: ONBOARDING_SOURCE },
      select: { scheduledStart: true },
    });
    placed = mine.filter(
      (m) =>
        m.scheduledStart &&
        m.scheduledStart >= weekStart &&
        m.scheduledStart < end
    ).length;
    unplaced = mine.length - placed;
  } catch (error) {
    logger.error(
      "Scheduling after onboarding failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    unplaced = tasks;
  }

  return {
    weekStart: plan.weekStart,
    tasks,
    habits,
    habitsAsTasks,
    projects: projectIds.size,
    placed,
    unplaced,
    lunch,
  };
}
