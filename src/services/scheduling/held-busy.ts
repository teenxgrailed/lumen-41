import { NOT_IN_SOMEDAY } from "@/services/scheduling/candidates";
import type { Prisma } from "@prisma/client";

import { activeProjectTaskWhere } from "@/lib/projects/archive";
import { openTaskWhere } from "@/lib/tasks/open-task";

import { TaskStatus } from "@/types/task";

import type { CalendarBusyBlock } from "./engine";

/**
 * Time a person's tasks hold that a scheduler run does not move: tasks pinned
 * by hand, and auto-scheduled tasks that are not part of the run (in progress,
 * cut by the plan's auto-schedule limit, or in another workspace). Their
 * slots are busy time, so nothing is placed on top of them. One read for both,
 * shared by the real run and the reschedule preview so the two place the same.
 */

/**
 * The open tasks assigned to `userId` that hold time between `now` and
 * `horizon`, in any workspace. A split task counts through its chunks too: the
 * task row keeps the first chunk only, so once that one is over the later
 * chunks are found on `scheduledBlocks`.
 */
export function heldTasksWhere(
  userId: string,
  now: Date,
  horizon: Date
): Prisma.TaskWhereInput {
  return {
    ...openTaskWhere(),
    ...NOT_IN_SOMEDAY,
    assigneeId: userId,
    isArchived: false,
    trashedAt: null,
    status: { not: TaskStatus.COMPLETED },
    scheduledStart: { not: null, lt: horizon },
    AND: [
      activeProjectTaskWhere,
      {
        OR: [
          { scheduledEnd: { gt: now } },
          { scheduledBlocks: { some: { end: { gt: now } } } },
        ],
      },
    ],
  };
}

export const heldTasksSelect = {
  id: true,
  title: true,
  scheduledStart: true,
  scheduledEnd: true,
  scheduledBlocks: { select: { start: true, end: true } },
} satisfies Prisma.TaskSelect;

export interface HeldTaskRow {
  id: string;
  title: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduledBlocks?: { start: Date; end: Date }[];
}

/**
 * Busy blocks for the held rows that are not in the run (`runTaskIds`): the
 * task's own span and each chunk, kept only where they are still ahead of
 * `now` and start before `horizon`.
 */
export function heldBusyBlocks(
  rows: readonly HeldTaskRow[],
  runTaskIds: ReadonlySet<string>,
  now: Date,
  horizon: Date
): CalendarBusyBlock[] {
  return rows
    .filter((task) => !runTaskIds.has(task.id))
    .flatMap((task) => {
      const spans = [
        ...(task.scheduledStart && task.scheduledEnd
          ? [{ start: task.scheduledStart, end: task.scheduledEnd }]
          : []),
        ...(task.scheduledBlocks ?? []),
      ];
      return spans
        .filter((span) => span.end > now && span.start < horizon)
        .map(
          (span): CalendarBusyBlock => ({
            id: task.id,
            title: task.title,
            start: span.start,
            end: span.end,
            source: "task",
          })
        );
    });
}

/**
 * The same held time as events, for a staging user that owns none of the
 * tasks (the reschedule preview): the run reads them as busy tasks, the
 * preview as busy calendar events, and both leave the same time free.
 */
export function heldBusyEvents(
  rows: readonly HeldTaskRow[],
  runTaskIds: ReadonlySet<string>,
  now: Date,
  horizon: Date
): { start: Date; end: Date; description: null }[] {
  return heldBusyBlocks(rows, runTaskIds, now, horizon).map((block) => ({
    start: block.start,
    end: block.end,
    description: null,
  }));
}
