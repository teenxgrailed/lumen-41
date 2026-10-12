import {
  type ScheduleSnapshot,
  captureSnapshot,
  restoreSnapshot,
} from "@/services/ai/reschedule-preview";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { z } from "zod";

import {
  dayKeySchema,
  iso,
  nextDayKey,
  publishTasksUpdated,
  startOfZonedDay,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext, TouchedRow } from "../types";

const snapshotSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          scheduledStart: z.string().nullable(),
          scheduledEnd: z.string().nullable(),
          scheduleScore: z.number().nullable(),
          lastScheduled: z.string().nullable(),
          isAutoScheduled: z.boolean(),
          autoScheduled: z.boolean(),
          updatedAt: z.string(),
        })
        .strict()
    ),
    blocks: z.array(
      z
        .object({
          taskId: z.string(),
          start: z.string(),
          end: z.string(),
          chunkIndex: z.number().int(),
          chunkCount: z.number().int(),
          isFrozen: z.boolean(),
        })
        .strict()
    ),
  })
  .strict();

/** Per-task fingerprint of everything the scheduler may change. */
function fingerprints(snapshot: ScheduleSnapshot) {
  const blocksByTask = new Map<string, ScheduleSnapshot["blocks"]>();
  for (const block of snapshot.blocks) {
    const list = blocksByTask.get(block.taskId) ?? [];
    list.push(block);
    blocksByTask.set(block.taskId, list);
  }
  return new Map(
    snapshot.tasks.map((task) => {
      const fields = { ...task, updatedAt: undefined };
      return [
        task.id,
        JSON.stringify({ fields, blocks: blocksByTask.get(task.id) ?? [] }),
      ];
    })
  );
}

/** Restricts a snapshot to the given task ids. */
function only(snapshot: ScheduleSnapshot, ids: Set<string>): ScheduleSnapshot {
  return {
    tasks: snapshot.tasks.filter((task) => ids.has(task.id)),
    blocks: snapshot.blocks.filter((block) => ids.has(block.taskId)),
  };
}

async function blockVersions(
  ctx: OpContext,
  taskIds: string[]
): Promise<TouchedRow[]> {
  if (!taskIds.length) return [];
  const blocks = await ctx.tx.scheduledBlock.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  // The scheduler recreates blocks, so there is no earlier version to keep.
  return blocks.map((block) => ({
    model: "scheduledBlock",
    id: block.id,
    updatedAt: block.updatedAt.toISOString(),
    beforeUpdatedAt: null,
  }));
}

export const scheduleAuto = defineOp({
  name: "schedule.auto",
  description:
    "Run the auto-scheduler over the workspace's open tasks. Undo puts every task it moved back where it was. Placement changes made by anything else while it runs are attributed to this run.",
  risk: "reversible",
  transactional: false,
  input: z.object({}).strict(),
  async run(ctx) {
    //todo: hold a per-user advisory lock around capture -> schedule ->
    // capture so a concurrent edit is not folded into this run's diff.
    const before = await captureSnapshot(ctx.userId, ctx.workspace);
    await scheduleAllTasksForUser(ctx.userId, {
      workspaceId:
        ctx.workspace.dataScope.mode === "workspace"
          ? ctx.workspaceId
          : undefined,
    });
    const after = await captureSnapshot(ctx.userId, ctx.workspace);

    const beforePrints = fingerprints(before);
    const afterPrints = fingerprints(after);
    const changed = new Set(
      after.tasks
        .filter(
          (task) => beforePrints.get(task.id) !== afterPrints.get(task.id)
        )
        .map((task) => task.id)
    );
    const beforeVersions = new Map(
      before.tasks.map((task) => [task.id, task.updatedAt])
    );
    // The scheduler bumps every unlocked task it clears, so its own block
    // changes always move Task.updatedAt. Block rows are versioned too, so a
    // later block-only edit by someone else still counts as a conflict.
    const touchedRows: TouchedRow[] = [
      ...after.tasks
        .filter((task) => changed.has(task.id))
        .map((task) => ({
          model: "task" as const,
          id: task.id,
          updatedAt: task.updatedAt,
          beforeUpdatedAt: beforeVersions.get(task.id) ?? null,
        })),
      ...(await blockVersions(ctx, [...changed])),
    ];
    const previous = only(before, changed);

    return {
      result: {
        changedTaskIds: [...changed],
        changes: after.tasks
          .filter((task) => changed.has(task.id))
          .map((task) => {
            const was = previous.tasks.find((row) => row.id === task.id);
            return {
              taskId: task.id,
              title: task.title,
              fromStart: was?.scheduledStart ?? null,
              toStart: task.scheduledStart,
              fromEnd: was?.scheduledEnd ?? null,
              toEnd: task.scheduledEnd,
            };
          }),
      },
      // The inverse already carries the full snapshot; keep `before` small.
      before: {
        tasks: previous.tasks.map((task) => ({
          id: task.id,
          scheduledStart: task.scheduledStart,
          scheduledEnd: task.scheduledEnd,
        })),
      },
      inverse: changed.size
        ? { op: "schedule.restore", input: { snapshot: previous } }
        : null,
      touched: touchedRows,
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

/** Inverse-only: writes a schedule snapshot (task placement and blocks) back. */
export const scheduleRestore = defineOp({
  name: "schedule.restore",
  description: "Write a stored schedule snapshot back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ snapshot: snapshotSchema }).strict(),
  async run(ctx, input) {
    const ids = new Set(input.snapshot.tasks.map((task) => task.id));
    const current = only(
      await captureSnapshot(ctx.userId, ctx.workspace, ctx.tx),
      ids
    );
    const currentVersions = new Map(
      current.tasks.map((task) => [task.id, task.updatedAt])
    );
    await restoreSnapshot(ctx.userId, ctx.workspace, input.snapshot, ctx.tx);
    const rows = await ctx.tx.task.findMany({
      where: { id: { in: [...ids] }, ...ctx.scope },
      select: { id: true, updatedAt: true },
    });
    return {
      result: { restoredTaskIds: rows.map((row) => row.id) },
      before: { taskIds: [...ids] },
      inverse: { op: "schedule.restore", input: { snapshot: current } },
      touched: [
        ...rows.map((row) => ({
          model: "task" as const,
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
          beforeUpdatedAt: currentVersions.get(row.id) ?? null,
        })),
        ...(await blockVersions(
          ctx,
          rows.map((row) => row.id)
        )),
      ],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const scheduleGetDay = defineOp({
  name: "schedule.get_day",
  description:
    "Read one day in the user's time zone: tasks placed on it (with their blocks) and open tasks due on it.",
  risk: "read",
  input: z.object({ date: dayKeySchema }).strict(),
  async run(ctx, input) {
    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const dayStart = startOfZonedDay(input.date, timeZone);
    const dayEnd = startOfZonedDay(nextDayKey(input.date), timeZone);
    const tasks = await ctx.tx.task.findMany({
      where: {
        ...ctx.scope,
        isArchived: false,
        OR: [
          { scheduledStart: { gte: dayStart, lt: dayEnd } },
          {
            scheduledBlocks: {
              some: { start: { lt: dayEnd }, end: { gt: dayStart } },
            },
          },
          {
            status: { not: "completed" },
            scheduledStart: null,
            dueDate: { gte: dayStart, lt: dayEnd },
          },
        ],
      },
      orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
      include: { scheduledBlocks: { orderBy: { chunkIndex: "asc" } } },
    });
    //todo: include calendar events for the day once a scoped event reader
    // exists outside the calendar routes.
    return {
      result: {
        date: input.date,
        timeZone,
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: iso(task.dueDate),
          scheduledStart: iso(task.scheduledStart),
          scheduledEnd: iso(task.scheduledEnd),
          blocks: task.scheduledBlocks.map((block) => ({
            start: block.start.toISOString(),
            end: block.end.toISOString(),
            chunkIndex: block.chunkIndex,
            chunkCount: block.chunkCount,
            isFrozen: block.isFrozen,
          })),
        })),
      },
    };
  },
});

export const scheduleOps = [scheduleAuto, scheduleRestore, scheduleGetDay];
