import type { Prisma, Task } from "@prisma/client";
import { RRule } from "rrule";

import { newDate } from "@/lib/date-utils";
import { normalizeRecurrenceRule } from "@/lib/utils/normalize-recurrence-rules";

import { TaskStatus } from "@/types/task";

export interface RecurringCompletion {
  occurrenceAt: Date;
  completedAt: Date;
}

/**
 * What a caller is told when a completion was a repeat tick and nothing was
 * written: the date the series comes due next, as `YYYY-MM-DD`.
 */
export interface RecurringAlreadyDone {
  nextDueDate: string | null;
}

/** The answer for a repeat tick on a series whose next occurrence is ahead. */
export function recurringAlreadyDone(
  task: Pick<Task, "dueDate">
): RecurringAlreadyDone {
  return {
    nextDueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
  };
}

/**
 * Completing a recurring series row records the current occurrence and, when
 * the rule has a next one, advances the series to it. Shared by the task API
 * and the connector so both complete a series the same way. Throws when the
 * rule cannot be parsed.
 */
export function planRecurringCompletion(
  task: Pick<
    Task,
    | "recurrenceRule"
    | "dueDate"
    | "startDate"
    | "scheduledStart"
    | "scheduledEnd"
  > & { lastCompletedDate?: Date | null },
  completedAt: Date
): {
  completion: RecurringCompletion;
  /**
   * True when this is a second tick on the day the series was just completed
   * and its current occurrence is still ahead. The first tick already
   * recorded the occurrence that was due; completing again would burn the
   * next one. Callers leave the task as it is.
   */
  duplicate: boolean;
  advance: {
    dueDate: Date;
    startDate: Date | undefined;
    scheduledStart: Date | null | undefined;
    scheduledEnd: Date | null | undefined;
    status: TaskStatus;
    completedAt: null;
    lastCompletedDate: Date;
  } | null;
} {
  // Normalize the recurrence rule to ensure compatibility with RRule
  const standardRecurrenceRule = normalizeRecurrenceRule(task.recurrenceRule!);
  const options = RRule.parseString(standardRecurrenceRule!);

  // For tasks, we only care about the date part
  const baseDate = newDate(task.dueDate || newDate());
  baseDate.setUTCHours(0, 0, 0, 0);

  // The series is anchored on the occurrence being completed. Without an
  // anchor rrule would use "now", and "every week" or "every month" would
  // follow the weekday or day of the month of the moment someone ticks it.
  options.dtstart = options.dtstart ?? baseDate;
  const rrule = new RRule(options);

  // The next date after both the occurrence and today, so ticking a task that
  // is weeks overdue lands it on a coming date, not on another past one.
  const today = newDate(completedAt);
  today.setUTCHours(0, 0, 0, 0);
  const from = today.getTime() > baseDate.getTime() ? today : baseDate;

  const nextOccurrence = rrule.after(from, false);
  if (nextOccurrence) nextOccurrence.setUTCHours(0, 0, 0, 0);

  const completion = { occurrenceAt: baseDate, completedAt };
  const duplicate =
    baseDate.getTime() > today.getTime() &&
    !!task.lastCompletedDate &&
    task.lastCompletedDate.toISOString().slice(0, 10) ===
      completedAt.toISOString().slice(0, 10);
  if (!nextOccurrence) return { completion, advance: null, duplicate };

  const dayMs = 1000 * 60 * 60 * 24;
  // Keep the distance between start date and due date on the next occurrence.
  let nextStartDate: Date | undefined;
  if (task.startDate && task.dueDate) {
    const startToDueDelta = Math.round(
      (task.dueDate.getTime() - task.startDate.getTime()) / dayMs
    );
    nextStartDate = newDate(nextOccurrence);
    nextStartDate.setDate(nextStartDate.getDate() - startToDueDelta);
  }
  // A placed task moves to the new date at the same time of day; the
  // scheduler keeps or re-plans it from there.
  const shift = Math.round(
    (nextOccurrence.getTime() - baseDate.getTime()) / dayMs
  );
  const move = (at: Date | null) =>
    at ? newDate(at.getTime() + shift * dayMs) : at;
  return {
    completion,
    duplicate,
    advance: {
      dueDate: nextOccurrence,
      startDate: nextStartDate,
      scheduledStart: move(task.scheduledStart ?? null),
      scheduledEnd: move(task.scheduledEnd ?? null),
      status: TaskStatus.TODO,
      completedAt: null,
      lastCompletedDate: completedAt,
    },
  };
}

/** Records the completed occurrence as its own immutable task row. */
export function upsertRecurringOccurrence(
  transaction: Prisma.TransactionClient,
  task: Task & { tags: { id: string }[] },
  completion: RecurringCompletion,
  userId: string
) {
  return transaction.task.upsert({
    where: {
      recurrenceMasterId_recurrenceInstanceAt: {
        recurrenceMasterId: task.id,
        recurrenceInstanceAt: completion.occurrenceAt,
      },
    },
    update: {},
    create: {
      title: task.title,
      description: task.description,
      status: TaskStatus.COMPLETED,
      dueDate: completion.occurrenceAt,
      startDate: task.startDate,
      duration: task.duration,
      estimatedMinutes: task.estimatedMinutes,
      estOptimistic: task.estOptimistic,
      estLikely: task.estLikely,
      estPessimistic: task.estPessimistic,
      minChunkMinutes: task.minChunkMinutes,
      maxChunkMinutes: task.maxChunkMinutes,
      deadline: task.deadline,
      hardDeadline: task.hardDeadline,
      energyRequired: task.energyRequired,
      priorityLevel: task.priorityLevel,
      contextTag: task.contextTag,
      priority: task.priority,
      energyLevel: task.energyLevel,
      preferredTime: task.preferredTime,
      projectId: task.projectId,
      workspaceId: task.workspaceId,
      assigneeId: task.assigneeId,
      busyStatus: task.busyStatus,
      stageId: task.stageId,
      scheduleId: task.scheduleId,
      isRecurring: false,
      recurrenceMasterId: task.id,
      recurrenceInstanceAt: completion.occurrenceAt,
      completedAt: completion.completedAt,
      userId,
      tags: {
        connect: task.tags.map((tag) => ({ id: tag.id })),
      },
    },
  });
}
