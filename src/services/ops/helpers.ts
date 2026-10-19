import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import type { RealtimeEventType } from "@/lib/realtime/channels";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { OpError } from "./errors";
import type { OpClient, OpContext, TouchedRow } from "./types";

const LOG_SOURCE = "ops-helpers";

export const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a calendar day as YYYY-MM-DD")
  .refine(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const [year, month, day] = value.split("-").map(Number);
      const date = newDate(Date.UTC(year, month - 1, day));
      return date.toISOString().slice(0, 10) === value;
    },
    { message: "Not a real calendar day" }
  );

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

/** `before` is the row as the op read it before writing; null when the op created it. */
export function touched(
  model: TouchedRow["model"],
  row: { id: string; updatedAt: Date },
  before: { updatedAt: Date } | null
): TouchedRow {
  return {
    model,
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
    beforeUpdatedAt: before ? before.updatedAt.toISOString() : null,
  };
}

/** What a task view needs besides the row: its labels and its files (metadata only). */
export const taskInclude = {
  tags: { select: { id: true } },
  attachments: {
    where: { bytes: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, mimeType: true, size: true },
  },
} satisfies Prisma.TaskInclude;

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
    include: {
      ...taskInclude,
      project: { select: { status: true } },
    },
  });
  if (!task) throw new OpError("NOT_FOUND", "Task not found");
  return task;
}

/** Same rule as PUT /api/tasks/[id]: a task in an archived project is read-only. */
export function assertProjectActive(task: {
  project: { status: string } | null;
}) {
  if (task.project?.status === "archived") {
    throw new OpError("PROJECT_ARCHIVED", "The task's project is archived");
  }
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

export function publishRealtimeAfterCommit(
  userId: string,
  type: RealtimeEventType
) {
  return async () => {
    try {
      await publishRealtimeEvent(userId, type);
    } catch (error) {
      logger.warn(
        "Could not publish ops realtime event",
        {
          userId,
          type,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  };
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
  /** Legacy scale; "none" is "No priority". */
  priority?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  scheduleId?: string | null;
  createdAt?: Date;
  tags?: { id: string }[];
  attachments?: {
    id: string;
    name: string;
    mimeType: string | null;
    size: number | null;
  }[];
}) {
  return {
    id: task.id,
    title: task.title,
    notes: task.description,
    status: task.status,
    dueDate: iso(task.dueDate),
    deadline: iso(task.deadline),
    priority: task.priority === "none" ? "NONE" : task.priorityLevel,
    recurrenceRule: task.isRecurring ? (task.recurrenceRule ?? null) : null,
    scheduleId: task.scheduleId ?? null,
    createdAt: task.createdAt ? task.createdAt.toISOString() : null,
    projectId: task.projectId,
    estimateMinutes: task.estimatedMinutes,
    scheduledStart: iso(task.scheduledStart),
    scheduledEnd: iso(task.scheduledEnd),
    isArchived: task.isArchived,
    completedAt: iso(task.completedAt),
    tagIds: task.tags?.map((tag) => tag.id) ?? [],
    ...(Array.isArray(task.attachments)
      ? {
          attachments: task.attachments.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            url: `/api/tasks/${task.id}/attachments/${file.id}`,
          })),
        }
      : {}),
    updatedAt: task.updatedAt.toISOString(),
    href: `/tasks?taskId=${task.id}`,
  };
}
