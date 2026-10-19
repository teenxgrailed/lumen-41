import type { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * Subtasks are `TaskPart` rows: one level, ordered by `position`, ticked
 * inside their task. A task with parts is the *closing* step of its own small
 * chain: the optional `entry` (the two-minute first step) opens it, the parts
 * follow in order, and the task itself is done last. `dependsOnId` is the one
 * blocker a task can wait on. Every AI path (Ask Needt chat, MCP, the brain
 * dump parser) shares the wording and the shapes below, so they cannot drift.
 */

export const MAX_SUBTASKS = 30;
export const SUBTASK_TITLE_MAX = 160;

/**
 * The one paragraph that tells a model how to shape work. Tool descriptions
 * and the chat system prompt both quote it.
 */
export const SUBTASK_GUIDANCE =
  "Break any non-trivial task (more than one sitting or more than one step) into subtasks: give `entry` as the very first small step (about two minutes), list `subtasks` in the order they are done, and treat the task itself as the closing step that is finished last, once every subtask is done. Keep subtasks short, concrete and one level deep. Use `dependsOnId` only when this task cannot start before another existing task is done.";

const subtaskItem = z.union([
  z.string().trim().min(1).max(SUBTASK_TITLE_MAX),
  z
    .object({
      title: z.string().trim().min(1).max(SUBTASK_TITLE_MAX),
      done: z.boolean().optional(),
    })
    .strict(),
]);

/** `["Pull numbers", { title: "Draft", done: false }]`, in the order done. */
export const subtaskListSchema = z.array(subtaskItem).max(MAX_SUBTASKS);

export const entrySchema = z.string().trim().min(1).max(SUBTASK_TITLE_MAX);

export interface SubtaskDraft {
  title: string;
  done: boolean;
}

export function normalizeSubtasks(
  list: z.infer<typeof subtaskListSchema> | undefined
): SubtaskDraft[] {
  return (list ?? []).map((item) =>
    typeof item === "string"
      ? { title: item.trim(), done: false }
      : { title: item.title.trim(), done: item.done ?? false }
  );
}

/** Nested-create data for `prisma.task.create({ data: { parts } })`. */
export function partsCreateData(
  drafts: readonly SubtaskDraft[],
  startAt = 0
): Prisma.TaskPartCreateNestedManyWithoutTaskInput | undefined {
  return drafts.length
    ? {
        create: drafts.map((d, i) => ({
          title: d.title,
          done: d.done,
          position: startAt + i,
        })),
      }
    : undefined;
}

export type BlockerCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * `dependsOnId` must name a live task in the caller's workspace, and the chain
 * above it must not lead back to `taskId` (a task that does not exist yet
 * cannot be part of a loop, so create passes none).
 */
export async function checkBlocker(
  auth: { userId: string; workspace: WorkspaceAccess },
  dependsOnId: string,
  taskId?: string
): Promise<BlockerCheck> {
  if (taskId && dependsOnId === taskId) {
    return { ok: false, status: 400, error: "A task cannot wait on itself" };
  }
  const scope = workspaceDataScopeWhere(auth.workspace, auth.userId);
  const blocker = await prisma.task.findFirst({
    where: { id: dependsOnId, ...scope, isArchived: false },
    select: { id: true, dependsOnId: true },
  });
  if (!blocker) {
    return { ok: false, status: 400, error: "dependsOnId is not a live task" };
  }
  if (!taskId) return { ok: true };
  const seen = new Set<string>([blocker.id]);
  let next = blocker.dependsOnId;
  while (next) {
    if (next === taskId) {
      return {
        ok: false,
        status: 409,
        error: "That dependency would make the tasks wait on each other",
      };
    }
    if (seen.has(next)) break;
    seen.add(next);
    const row = await prisma.task.findFirst({
      where: { id: next, ...scope },
      select: { dependsOnId: true },
    });
    next = row?.dependsOnId ?? null;
  }
  return { ok: true };
}

/** What a caller sees of a part. */
export const subtaskSelect = {
  id: true,
  title: true,
  done: true,
  position: true,
} satisfies Prisma.TaskPartSelect;

export type SubtaskResult =
  | {
      ok: true;
      subtasks: Prisma.TaskPartGetPayload<{ select: typeof subtaskSelect }>[];
    }
  | { ok: false; status: number; error: string };

/**
 * A subtask write changes what the parent task shows (its n/m count), so the
 * parent's `updatedAt` moves with it; clients and sync compare on that.
 */
async function touchTask(taskId: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: { updatedAt: newDate() },
    select: { id: true },
  });
}

/** Append subtasks after the task's last one. */
export async function appendSubtasks(input: {
  userId: string;
  workspace: WorkspaceAccess;
  taskId: string;
  subtasks: readonly SubtaskDraft[];
}): Promise<SubtaskResult> {
  const scope = workspaceDataScopeWhere(input.workspace, input.userId);
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, ...scope },
    select: {
      id: true,
      isArchived: true,
      _count: { select: { parts: true } },
    },
  });
  if (!task) return { ok: false, status: 404, error: "Task not found" };
  if (task.isArchived) {
    return {
      ok: false,
      status: 409,
      error: "Archived tasks are read-only. Restore the task first.",
    };
  }
  if (task._count.parts + input.subtasks.length > MAX_SUBTASKS) {
    return {
      ok: false,
      status: 400,
      error: `A task holds at most ${MAX_SUBTASKS} subtasks`,
    };
  }
  const last = await prisma.taskPart.findFirst({
    where: { taskId: task.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const start = last ? last.position + 1 : 0;
  const created = await prisma.$transaction(
    input.subtasks.map((d, i) =>
      prisma.taskPart.create({
        data: {
          taskId: task.id,
          title: d.title,
          done: d.done,
          position: start + i,
        },
        select: subtaskSelect,
      })
    )
  );
  await touchTask(task.id);
  return { ok: true, subtasks: created };
}

export type SubtaskTickResult =
  | {
      ok: true;
      subtask: Prisma.TaskPartGetPayload<{ select: typeof subtaskSelect }>;
      /** Open subtasks left on the task after this write. */
      open: number;
      /** True when this was the last open one: the closing step is next. */
      allDone: boolean;
    }
  | { ok: false; status: number; error: string };

/**
 * Tick or untick one subtask. It never completes the task itself; the caller
 * is told when `allDone` so the model (or person) can close the final step.
 */
export async function setSubtaskDone(input: {
  userId: string;
  workspace: WorkspaceAccess;
  taskId: string;
  subtaskId: string;
  done: boolean;
}): Promise<SubtaskTickResult> {
  const scope = workspaceDataScopeWhere(input.workspace, input.userId);
  const part = await prisma.taskPart.findFirst({
    where: {
      id: input.subtaskId,
      taskId: input.taskId,
      task: { is: { ...scope, isArchived: false } },
    },
    select: { id: true },
  });
  if (!part) return { ok: false, status: 404, error: "Subtask not found" };
  const subtask = await prisma.taskPart.update({
    where: { id: part.id },
    data: { done: input.done },
    select: subtaskSelect,
  });
  await touchTask(input.taskId);
  const open = await prisma.taskPart.count({
    where: { taskId: input.taskId, done: false },
  });
  return { ok: true, subtask, open, allDone: open === 0 };
}
