import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { OpError } from "./errors";
import type { OpClient, OpContext, TouchedRow } from "./types";

const LOG_SOURCE = "ops-helpers";

export const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a calendar day as YYYY-MM-DD");

/** Accepts an ISO date-time or a YYYY-MM-DD day; rejects anything Date cannot read. */
export const dateInputSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(newDate(value).getTime()), {
    message: "Expected an ISO date or date-time",
  });

export const isoOrNull = z.string().datetime({ offset: true }).nullable();

export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function dateOrNull(value: string | null | undefined) {
  return value ? newDate(value) : null;
}

export function touched(
  model: TouchedRow["model"],
  row: { id: string; updatedAt: Date }
): TouchedRow {
  return { model, id: row.id, updatedAt: row.updatedAt.toISOString() };
}

export async function findScopedTask(
  ctx: OpContext,
  taskId: string,
  options: { includeArchived?: boolean } = {}
) {
  const task = await ctx.tx.task.findFirst({
    where: {
      id: taskId,
      ...ctx.scope,
      ...(options.includeArchived ? {} : { isArchived: false }),
    },
    include: { tags: { select: { id: true } } },
  });
  if (!task) throw new OpError("NOT_FOUND", "Task not found");
  return task;
}

export async function findScopedProject(ctx: OpContext, projectId: string) {
  const project = await ctx.tx.project.findFirst({
    where: { id: projectId, ...ctx.scope },
  });
  if (!project) throw new OpError("NOT_FOUND", "Project not found");
  return project;
}

export async function userTimeZone(client: OpClient, userId: string) {
  const settings = await client.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return normalizeUserTimeZone(settings?.timeZone);
}

/** Midnight of `dayKey` in `timeZone`, as an instant. */
export function startOfZonedDay(dayKey: string, timeZone: string) {
  return fromZonedTime(`${dayKey}T00:00:00`, timeZone);
}

/** The calendar day after `dayKey`, independent of any time zone. */
export function nextDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return newDate(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

/** The same wall-clock time as `instant`, moved to `dayKey`, in `timeZone`. */
export function moveInstantToDay(
  instant: Date,
  dayKey: string,
  timeZone: string
) {
  const clock = formatInTimeZone(instant, timeZone, "HH:mm:ss.SSS");
  return fromZonedTime(`${dayKey}T${clock}`, timeZone);
}

export function publishTasksUpdated(userId: string) {
  return async () => {
    try {
      await publishRealtimeEvent(userId, "tasks-updated");
    } catch (error) {
      logger.warn(
        "Could not publish ops realtime event",
        {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  };
}

/** Public, JSON-safe view of a task returned by ops. */
export function taskView(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  deadline: Date | null;
  priorityLevel: string;
  projectId: string | null;
  estimatedMinutes: number | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  isArchived: boolean;
  completedAt: Date | null;
  updatedAt: Date;
  tags?: { id: string }[];
}) {
  return {
    id: task.id,
    title: task.title,
    notes: task.description,
    status: task.status,
    dueDate: iso(task.dueDate),
    deadline: iso(task.deadline),
    priority: task.priorityLevel,
    projectId: task.projectId,
    estimateMinutes: task.estimatedMinutes,
    scheduledStart: iso(task.scheduledStart),
    scheduledEnd: iso(task.scheduledEnd),
    isArchived: task.isArchived,
    completedAt: iso(task.completedAt),
    tagIds: task.tags?.map((tag) => tag.id) ?? [],
    updatedAt: task.updatedAt.toISOString(),
    href: `/tasks?taskId=${task.id}`,
  };
}
