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
 * Completing a recurring series row records the current occurrence and, when
 * the rule has a next one, advances the series to it. Shared by the task API
 * and the connector so both complete a series the same way. Throws when the
 * rule cannot be parsed.
 */
export function planRecurringCompletion(
  task: Pick<Task, "recurrenceRule" | "dueDate" | "startDate">,
  completedAt: Date
): {
  completion: RecurringCompletion;
  advance: {
    dueDate: Date;
    startDate: Date | undefined;
    status: TaskStatus;
    completedAt: null;
    lastCompletedDate: Date;
  } | null;
} {
  // Normalize the recurrence rule to ensure compatibility with RRule
  const standardRecurrenceRule = normalizeRecurrenceRule(task.recurrenceRule!);
  const rrule = RRule.fromString(standardRecurrenceRule!);

  // For tasks, we only care about the date part
  const baseDate = newDate(task.dueDate || newDate());
  baseDate.setUTCHours(0, 0, 0, 0);

  // Add one day to the base date to ensure we get the next occurrence
  const searchDate = newDate(baseDate);
  searchDate.setDate(searchDate.getDate() + 1);

  const nextOccurrence = rrule.after(searchDate);
  if (nextOccurrence) nextOccurrence.setUTCHours(0, 0, 0, 0);

  const completion = { occurrenceAt: baseDate, completedAt };
  if (!nextOccurrence) return { completion, advance: null };

  // Keep the distance between start date and due date on the next occurrence.
  let nextStartDate: Date | undefined;
  if (task.startDate && task.dueDate) {
    const startToDueDelta = Math.round(
      (task.dueDate.getTime() - task.startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    nextStartDate = newDate(nextOccurrence);
    nextStartDate.setDate(nextStartDate.getDate() - startToDueDelta);
  }
  return {
    completion,
    advance: {
      dueDate: nextOccurrence,
      startDate: nextStartDate,
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
