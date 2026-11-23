import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";

import { dateOrNull, isoOrNull } from "../helpers";
import type { OpContext } from "../types";

const levelPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

/** One scheduled chunk, as stored in snapshots for exact restores. */
export const blockSnapshot = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    chunkIndex: z.number().int().min(0),
    chunkCount: z.number().int().min(1),
    isFrozen: z.boolean(),
    userId: z.string().nullable(),
  })
  .strict();

/**
 * Every task column an inverse may write back. Keys mirror Prisma; dates are
 * ISO strings so the inverse survives the JSON column.
 */
export const restorableFields = z
  .object({
    title: z.string(),
    /** The task's first small step (Always easy start). */
    entry: z.string().nullable(),
    description: z.string().nullable(),
    status: z.string(),
    dueDate: isoOrNull,
    deadline: isoOrNull,
    priorityLevel: levelPriority,
    priority: z.string().nullable(),
    isRecurring: z.boolean(),
    recurrenceRule: z.string().nullable(),
    scheduleId: z.string().nullable(),
    projectId: z.string().nullable(),
    goalId: z.string().nullable(),
    estimatedMinutes: z.number().int().nullable(),
    duration: z.number().int().nullable(),
    completedAt: isoOrNull,
    isArchived: z.boolean(),
    archivedAt: isoOrNull,
    trashedAt: isoOrNull,
    scheduledStart: isoOrNull,
    scheduledEnd: isoOrNull,
    scheduleLocked: z.boolean(),
    isAutoScheduled: z.boolean(),
    autoScheduled: z.boolean(),
    scheduleScore: z.number().nullable(),
    startDate: isoOrNull,
    lastCompletedDate: isoOrNull,
    /** The scheduler's not-before date (Always easy start sets it on a spread). */
    postponedUntil: isoOrNull,
    /** Always easy start's bookkeeping, put back with the entry on undo. */
    rescheduleCount: z.number().int().min(0),
    simplifiedAt: isoOrNull,
    /** Idea cards (openspec idea-cards): what kind of row it is and its card state. */
    kind: z.enum(["TASK", "IDEA"]),
    ideaSource: z.string().nullable(),
    ideaSnoozedUntil: isoOrNull,
    ideaLastShownAt: isoOrNull,
    ideaSkipCount: z.number().int().min(0),
    ideaCheckedAt: isoOrNull,
    /** An idea is never Someday, never frozen or hard-deadlined: converting clears them. */
    somedayAt: isoOrNull,
    somedayReason: z.string().nullable(),
    isFrozen: z.boolean(),
    hardDeadline: z.boolean(),
  })
  .partial()
  .strict();

export type RestorableFields = z.infer<typeof restorableFields>;
export type BlockSnapshot = z.infer<typeof blockSnapshot>;

const DATE_FIELDS = new Set([
  "dueDate",
  "deadline",
  "completedAt",
  "archivedAt",
  "trashedAt",
  "scheduledStart",
  "scheduledEnd",
  "startDate",
  "lastCompletedDate",
  "postponedUntil",
  "simplifiedAt",
  "ideaSnoozedUntil",
  "ideaLastShownAt",
  "ideaCheckedAt",
  "somedayAt",
]);

export function pickRestorable(
  task: Record<string, unknown>,
  keys: (keyof RestorableFields)[]
): RestorableFields {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = task[key];
    out[key] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out as RestorableFields;
}

export function restorableToData(fields: RestorableFields) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = DATE_FIELDS.has(key)
      ? dateOrNull(value as string | null)
      : value;
  }
  return data as Prisma.TaskUncheckedUpdateInput;
}

export async function snapshotBlocks(
  ctx: OpContext,
  id: string,
  userId?: string | null
) {
  const blocks = await ctx.tx.scheduledBlock.findMany({
    where: { taskId: id, ...(userId ? { userId } : {}) },
    orderBy: { chunkIndex: "asc" },
  });
  return blocks.map(
    (block): BlockSnapshot => ({
      start: block.start.toISOString(),
      end: block.end.toISOString(),
      chunkIndex: block.chunkIndex,
      chunkCount: block.chunkCount,
      isFrozen: block.isFrozen,
      userId: block.userId,
    })
  );
}

export async function replaceBlocks(
  ctx: OpContext,
  id: string,
  blocks: BlockSnapshot[],
  userId?: string | null
) {
  await ctx.tx.scheduledBlock.deleteMany({
    where: { taskId: id, ...(userId ? { userId } : {}) },
  });
  if (blocks.length) {
    await ctx.tx.scheduledBlock.createMany({
      data: blocks.map((block) => ({
        taskId: id,
        userId: block.userId,
        start: newDate(block.start),
        end: newDate(block.end),
        chunkIndex: block.chunkIndex,
        chunkCount: block.chunkCount,
        isFrozen: block.isFrozen,
      })),
    });
  }
}

export function activity(
  ctx: OpContext,
  action: string,
  workspaceId: string | null
) {
  return workspaceId
    ? {
        activities: {
          create: { workspaceId, actorId: ctx.userId, action },
        },
      }
    : {};
}
