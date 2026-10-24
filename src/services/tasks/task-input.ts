import {
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  TaskBusyStatus,
  TaskStage,
} from "@prisma/client";
import { z } from "zod";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * What `POST /api/tasks` and `PUT /api/tasks/[id]` accept from a client.
 *
 * The body used to be spread into `prisma.task.create/update` behind a list of
 * keys to delete, so anything not on that list reached Prisma, nested
 * relation writes included (`reminders: { create: [{ userId: <someone else> }] }`
 * would have Needt notify a stranger). Now only the columns below get through,
 * each checked. Everything that points at another row (project, assignee,
 * labels, work hours, the origin page) is checked by the route, and nothing
 * here can carry a `userId` or `workspaceId`: the server derives them.
 */

const nullableString = z.string().nullable();
const nullableInt = z.number().int().nullable();
const nullableDate = z
  .string()
  .transform((value, ctx) => {
    const date = newDate(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return date;
  })
  .nullable();

/** Columns a client may write on a task of its own. */
const taskColumns = {
  description: nullableString,
  status: z.string(),
  dueDate: nullableDate,
  startDate: nullableDate,
  duration: nullableInt,
  priority: nullableString,
  energyLevel: nullableString,
  preferredTime: nullableString,
  energyRequired: z.nativeEnum(SchedulingEnergyLevel),
  estimatedMinutes: nullableInt,
  estOptimistic: nullableInt,
  estLikely: nullableInt,
  estPessimistic: nullableInt,
  minChunkMinutes: nullableInt,
  maxChunkMinutes: nullableInt,
  deadline: nullableDate,
  hardDeadline: z.boolean(),
  priorityLevel: z.nativeEnum(SchedulingTaskPriority),
  contextTag: nullableString,
  isFrozen: z.boolean(),
  /** Another task of the workspace; the route checks it. */
  dependsOnId: nullableString,
  autoScheduled: z.boolean(),
  isAutoScheduled: z.boolean(),
  scheduleLocked: z.boolean(),
  scheduledStart: nullableDate,
  scheduledEnd: nullableDate,
  scheduleScore: z.number().finite().nullable(),
  lastScheduled: nullableDate,
  availableFrom: nullableDate,
  postponedUntil: nullableDate,
  isRecurring: z.boolean(),
  lastCompletedDate: nullableDate,
  completedAt: nullableDate,
  busyStatus: z.nativeEnum(TaskBusyStatus),
  stageId: nullableString,
  entry: nullableString,
  noSlot: z.boolean(),
  valueCents: nullableInt,
  earnedCents: nullableInt,
  globalStage: z.nativeEnum(TaskStage).nullable(),
  /**
   * Not columns: the route turns each into a checked relation write. (The v3
   * columns, origin / trash / split / fullTime, are read apart, by
   * `parseV3Fields`.)
   */
  tagIds: z.array(z.string()).max(50).nullable(),
  recurrenceRule: nullableString,
  scheduleId: nullableString,
  assigneeId: nullableString,
  projectId: nullableString,
};

const columns = z.object(taskColumns).partial();

export const taskCreateSchema = columns.extend({
  title: z.string(),
  /** A client-chosen id, so a page item and its task share one. */
  id: z.string().min(1).max(128).optional(),
});

export const taskUpdateSchema = columns.extend({
  title: z.string().optional(),
  isArchived: z.boolean().optional(),
  /** "Start task now" may land inside blocked hours. */
  bypassBlockedHours: z.boolean().optional(),
});

/**
 * Keys an older client echoes back from a read. They have their own routes or
 * are set by the server, so they are dropped rather than refused, as before.
 */
const IGNORED_KEYS = new Set([
  "project",
  "assignee",
  "activities",
  "parts",
  "waits",
  "attachments",
  "properties",
  "archivedAt",
  "recurrenceMasterId",
  "recurrenceInstanceAt",
]);

export type TaskInputResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseTaskInput<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  body: unknown
): TaskInputResult<z.output<S>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request body" };
  }
  const raw = body as Record<string, unknown>;
  // A key that is not a column but carries an object or a list is a relation
  // write (tags, reminders, scheduledBlocks, habit...). Refuse it by name
  // instead of quietly dropping it.
  for (const [key, value] of Object.entries(raw)) {
    if (
      !(key in schema.shape) &&
      !IGNORED_KEYS.has(key) &&
      value !== null &&
      typeof value === "object"
    ) {
      return { ok: false, error: `Invalid ${key}: not writable here` };
    }
  }
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape)) {
    if (key in raw && raw[key] !== undefined) picked[key] = raw[key];
  }
  const result = schema.safeParse(picked);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `Invalid ${issue?.path.join(".") || "field"}: ${issue?.message ?? "invalid"}`,
    };
  }
  return { ok: true, data: result.data };
}

export const parseTaskCreate = (body: unknown) =>
  parseTaskInput(taskCreateSchema, body);

export const parseTaskUpdate = (body: unknown) =>
  parseTaskInput(taskUpdateSchema, body);

/**
 * True when `dependsOnId` is not a task the caller can see in this workspace
 * (or is the task itself). The link is a foreign key, so without this a task
 * could be pointed at one in somebody else's workspace.
 */
export async function isForeignDependency(input: {
  userId: string;
  workspace: WorkspaceAccess | undefined;
  dependsOnId: string;
  taskId?: string;
}): Promise<boolean> {
  if (input.taskId && input.dependsOnId === input.taskId) return true;
  const blocker = await prisma.task.findFirst({
    where: {
      id: input.dependsOnId,
      ...workspaceDataScopeWhere(input.workspace, input.userId),
    },
    select: { id: true },
  });
  return !blocker;
}
