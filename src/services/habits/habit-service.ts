import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import {
  addCalendarDays,
  format,
  fromZonedTime,
  newDate,
  startOfWeek,
  toZonedTime,
} from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDateKey,
  habitDayKey,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

export async function materializeHabitWeek(
  userId: string,
  workspace: WorkspaceAccess,
  habitId: string
) {
  const habit = await prisma.habit.findFirst({
    where: {
      id: habitId,
      ...workspaceDataScopeWhere(workspace, userId),
      userId,
      archivedAt: null,
      isActive: true,
    },
  });
  if (!habit) return null;
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true, weekStartDay: true },
  });
  const timeZone = settings?.timeZone || "UTC";
  const weekStartsOn = settings?.weekStartDay === "sunday" ? 0 : 1;
  const zonedNow = toZonedTime(newDate(), timeZone);
  const weekStart = startOfWeek(zonedNow, { weekStartsOn });
  const allowedDays = new Set(
    habit.daysOfWeek.length ? habit.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
  );
  const occurrences = Array.from({ length: 7 }, (_, offset) =>
    addCalendarDays(weekStart, offset)
  )
    .filter((day) => allowedDays.has(day.getDay()))
    .slice(0, habit.targetOccurrencesPerWeek)
    .map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return {
        start: fromZonedTime(`${key}T00:00:00`, timeZone),
        deadline: fromZonedTime(
          `${format(addCalendarDays(day, 1), "yyyy-MM-dd")}T00:00:00`,
          timeZone
        ),
      };
    });

  await prisma.task.createMany({
    data: occurrences.map((occurrence) => ({
      title: habit.title,
      description: habit.description,
      status: "todo",
      duration: habit.estimatedMinutes,
      estimatedMinutes: habit.estimatedMinutes,
      energyRequired: habit.energyRequired,
      priorityLevel: habit.priority,
      userId,
      workspaceId: workspace.workspaceId,
      assigneeId: userId,
      scheduleId: habit.scheduleId,
      availableFrom: occurrence.start,
      deadline: occurrence.deadline,
      autoScheduled: true,
      isAutoScheduled: true,
      habitId: habit.id,
      habitOccurrenceAt: occurrence.start,
    })),
    skipDuplicates: true,
  });
  const result = await scheduleAllTasksForUserDetailed(userId, {
    workspaceId: workspace.workspaceId,
  });
  return {
    habitId,
    occurrences: occurrences.map((occurrence) =>
      occurrence.start.toISOString()
    ),
    unscheduled: result.scheduleResult.unscheduled,
  };
}

/** A habit day that is not a real calendar date, or lies in the future. */
export class HabitCompletionDateError extends Error {}

export async function setHabitCompletionToday(input: {
  userId: string;
  workspace: WorkspaceAccess;
  habitId: string;
  completed: boolean;
  now?: Date;
  /** yyyy-MM-dd in the person's time zone; today when omitted. */
  dateKey?: string;
}) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId: input.userId },
    select: { timeZone: true },
  });
  const timeZone = normalizeUserTimeZone(settings?.timeZone);
  const todayKey = habitDayKey(input.now ?? newDate(), timeZone);
  const dateKey = input.dateKey ?? todayKey;
  const date = habitDateFromKey(dateKey);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ||
    Number.isNaN(date.getTime()) ||
    habitDateKey(date) !== dateKey
  ) {
    throw new HabitCompletionDateError("date must be a yyyy-MM-dd day");
  }
  if (dateKey > todayKey) {
    throw new HabitCompletionDateError("A habit cannot be kept in the future");
  }

  return prisma.$transaction(async (transaction) => {
    const habit = await transaction.habit.findFirst({
      where: {
        id: input.habitId,
        ...workspaceDataScopeWhere(input.workspace, input.userId),
        userId: input.userId,
        archivedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (!habit) return null;

    if (input.completed) {
      await transaction.habitCompletion.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        update: {},
        create: { habitId: habit.id, date },
      });
    } else {
      await transaction.habitCompletion.deleteMany({
        where: { habitId: habit.id, date },
      });
    }
    return { habitId: habit.id, date: dateKey, completed: input.completed };
  });
}
