import { z } from "zod";

import {
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { isTaskPlacementBlocked } from "@/lib/flexible-hours-guard-server";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

/**
 * Placing a task by hand, for callers outside the app's own screens (the MCP
 * connector, `POST /api/connect/tasks`, `PATCH /api/connect/tasks/:id`).
 *
 * The app does the same through `PUT /api/tasks/[id]`: a drop on the
 * timeline or a time picked in the task sheet sends `scheduledStart`,
 * `scheduledEnd` and `scheduleLocked: true` (with `isAutoScheduled: false`),
 * the due day becomes the placed day, and one frozen block holds the time.
 * "Auto" in the sheet sends `scheduleLocked: false, isAutoScheduled: true`
 * and the scheduler takes the task back. This module is that rule once, so
 * both paths write the same placement.
 */

/** Minutes a placed task occupies when it has no estimate (the app's default). */
export const DEFAULT_PLACEMENT_MINUTES = 30;

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const placementFields = {
  start: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Place the task at this time and pin it there, as dragging it onto the calendar does: ISO 8601, either with an offset (2026-10-25T14:00:00+02:00) or a wall-clock time read in the person's time zone (2026-10-25T14:00). It lasts estimatedMinutes (30 when there is no estimate), the due day becomes that day, and the scheduler will not move it."
    ),
  pinned: z
    .boolean()
    .optional()
    .describe(
      "true pins the task at the time it already has; false unpins it and hands it back to the scheduler, which may move it."
    ),
  autoSchedule: z
    .boolean()
    .optional()
    .describe(
      "Whether the scheduler places this task. false takes it out of the scheduler: it keeps any time it has and gets no new one. Pinning turns it off and unpinning on, unless you say otherwise."
    ),
};

export interface PlacementInput {
  start?: string;
  pinned?: boolean;
  autoSchedule?: boolean;
}

/** The task columns a placement reads; a task being created has nulls. */
export interface PlacementTask {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedMinutes: number | null;
  duration: number | null;
}

export interface PlacementData {
  scheduledStart?: Date;
  scheduledEnd?: Date;
  scheduleLocked?: boolean;
  isAutoScheduled?: boolean;
  autoScheduled?: boolean;
  scheduleScore?: null;
  dueDate?: Date;
}

export type PlacementPlan =
  | {
      ok: true;
      data: PlacementData;
      /** The frozen block to write once the task row is saved. */
      frozen: { start: Date; end: Date } | null;
    }
  | { ok: false; status: number; error: string };

export function hasPlacement(input: PlacementInput) {
  return (
    input.start !== undefined ||
    input.pinned !== undefined ||
    input.autoSchedule !== undefined
  );
}

/**
 * An instant from an ISO 8601 date-time. One without an offset is a
 * wall-clock time in `timeZone`, the way the app reads a time someone picks.
 */
export function parsePlacementStart(
  value: string,
  timeZone: string
): Date | null {
  const text = value.trim();
  if (WALL_CLOCK.test(text)) {
    const stamp = text.length === 16 ? `${text}:00` : text;
    const date = fromZonedTime(stamp, timeZone);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!z.string().datetime({ offset: true }).safeParse(text).success) {
    return null;
  }
  const date = newDate(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function personTimeZone(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return normalizeUserTimeZone(settings?.timeZone);
}

/**
 * What a placement writes, checked the way `PUT /api/tasks/[id]` checks a
 * placement: the task must have someone to schedule it for and the time must
 * not be blocked out. `null` when the input asks for no placement change.
 */
export async function planPlacement(input: {
  userId: string;
  /** Whose calendar the task is placed on; null = an unassigned task. */
  schedulingUserId: string | null;
  task: PlacementTask;
  placement: PlacementInput;
  /** A new estimate sent in the same write. */
  estimatedMinutes?: number | null;
}): Promise<PlacementPlan | null> {
  const { placement, task } = input;
  if (!hasPlacement(placement)) return null;

  if (placement.start !== undefined) {
    if (placement.pinned === false) {
      return {
        ok: false,
        status: 400,
        error:
          "start pins the task at that time. Leave pinned out, or send pinned: false without start to hand it back to the scheduler.",
      };
    }
    if (!input.schedulingUserId) {
      return {
        ok: false,
        status: 400,
        error: "Assign the task before scheduling it",
      };
    }
    const timeZone = await personTimeZone(input.userId);
    const start = parsePlacementStart(placement.start, timeZone);
    if (!start) {
      return {
        ok: false,
        status: 400,
        error:
          "start must be an ISO 8601 date-time, e.g. 2026-10-25T14:00 (your time zone) or 2026-10-25T14:00:00+02:00",
      };
    }
    const minutes =
      input.estimatedMinutes ??
      task.estimatedMinutes ??
      task.duration ??
      DEFAULT_PLACEMENT_MINUTES;
    const end = addMinutes(start, minutes);
    if (await isTaskPlacementBlocked(input.schedulingUserId, start, end)) {
      return { ok: false, status: 400, error: "This time is blocked out" };
    }
    const day = formatInTimeZone(start, timeZone, "yyyy-MM-dd");
    return {
      ok: true,
      data: {
        scheduledStart: start,
        scheduledEnd: end,
        scheduleLocked: true,
        isAutoScheduled: placement.autoSchedule ?? false,
        autoScheduled: false,
        scheduleScore: null,
        dueDate: fromZonedTime(`${day}T00:00:00`, timeZone),
      },
      frozen: { start, end },
    };
  }

  if (placement.pinned === true) {
    if (!task.scheduledStart || !task.scheduledEnd) {
      return {
        ok: false,
        status: 409,
        error: "The task has no time yet. Send start to place and pin it.",
      };
    }
    // The app's "Fixed": the blocks the task has stay where they are.
    return {
      ok: true,
      data: {
        scheduleLocked: true,
        isAutoScheduled: placement.autoSchedule ?? false,
      },
      frozen: null,
    };
  }

  if (placement.pinned === false) {
    // The app's "Auto": the scheduler run after the write places it anew.
    const auto = placement.autoSchedule ?? true;
    return {
      ok: true,
      data: {
        scheduleLocked: false,
        isAutoScheduled: auto,
        ...(auto ? {} : { autoScheduled: false }),
      },
      frozen: null,
    };
  }

  const auto = placement.autoSchedule === true;
  return {
    ok: true,
    data: auto
      ? { isAutoScheduled: true }
      : { isAutoScheduled: false, autoScheduled: false },
    frozen: null,
  };
}

/**
 * A manually placed task is represented by one frozen block. Keeping the
 * block relation in sync makes Calendar, Space, Focus, and connector reads
 * all observe the same placement without a second storage model.
 */
export async function writeFrozenPlacement(input: {
  taskId: string;
  userId: string;
  start: Date;
  end: Date;
}) {
  await prisma.$transaction([
    prisma.scheduledBlock.deleteMany({ where: { taskId: input.taskId } }),
    prisma.scheduledBlock.create({
      data: {
        taskId: input.taskId,
        userId: input.userId,
        start: input.start,
        end: input.end,
        chunkIndex: 0,
        chunkCount: 1,
        isFrozen: true,
      },
    }),
  ]);
}
