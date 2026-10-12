import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

import { OpError } from "../errors";
import {
  dateInputSchema,
  dateOrNull,
  dayKeySchema,
  findScopedProject,
  findScopedTask,
  isoOrNull,
  moveInstantToDay,
  publishTasksUpdated,
  startOfZonedDay,
  taskView,
  touched,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext } from "../types";

const taskId = z.string().min(1);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const estimate = z.number().int().min(5).max(1440);
const OPEN_STATUSES = ["todo", "in_progress"] as const;

/** One scheduled chunk, as stored in snapshots for exact restores. */
const blockSnapshot = z
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
const restorableFields = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    dueDate: isoOrNull,
    deadline: isoOrNull,
    priorityLevel: priority,
    projectId: z.string().nullable(),
    estimatedMinutes: z.number().int().nullable(),
    duration: z.number().int().nullable(),
    completedAt: isoOrNull,
    isArchived: z.boolean(),
    archivedAt: isoOrNull,
    scheduledStart: isoOrNull,
    scheduledEnd: isoOrNull,
    scheduleLocked: z.boolean(),
  })
  .partial()
  .strict();

type RestorableFields = z.infer<typeof restorableFields>;
type BlockSnapshot = z.infer<typeof blockSnapshot>;

const DATE_FIELDS = new Set([
  "dueDate",
  "deadline",
  "completedAt",
  "archivedAt",
  "scheduledStart",
  "scheduledEnd",
]);

function pickRestorable(
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

function restorableToData(fields: RestorableFields) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = DATE_FIELDS.has(key)
      ? dateOrNull(value as string | null)
      : value;
  }
  return data as Prisma.TaskUncheckedUpdateInput;
}

async function snapshotBlocks(ctx: OpContext, id: string) {
  const blocks = await ctx.tx.scheduledBlock.findMany({
    where: { taskId: id },
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

async function replaceBlocks(
  ctx: OpContext,
  id: string,
  blocks: BlockSnapshot[]
) {
  await ctx.tx.scheduledBlock.deleteMany({ where: { taskId: id } });
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

function activity(ctx: OpContext, action: string, workspaceId: string | null) {
  return workspaceId
    ? {
        activities: {
          create: { workspaceId, actorId: ctx.userId, action },
        },
      }
    : {};
}

async function assertTagsOwned(ctx: OpContext, tagIds: string[]) {
  if (!tagIds.length) return;
  const owned = await ctx.tx.tag.count({
    where: { id: { in: tagIds }, userId: ctx.userId },
  });
  if (owned !== new Set(tagIds).size) {
    throw new OpError("INVALID_INPUT", "Unknown tag id");
  }
}

async function assertProjectUsable(ctx: OpContext, projectId: string) {
  const project = await findScopedProject(ctx, projectId);
  if (project.status === "archived") {
    throw new OpError("CONFLICT", "That project is archived");
  }
}

// ---------------------------------------------------------------- read ops

export const taskList = defineOp({
  name: "task.list",
  description:
    "List tasks in the workspace. Filters: status (open, completed, all), projectId, text query.",
  risk: "read",
  input: z
    .object({
      status: z.enum(["open", "completed", "all"]).default("open"),
      projectId: z.string().min(1).optional(),
      query: z.string().min(1).max(200).optional(),
      includeArchived: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(50),
    })
    .strict(),
  async run(ctx, input) {
    const tasks = await ctx.tx.task.findMany({
      where: {
        ...ctx.scope,
        ...(input.includeArchived ? {} : { isArchived: false }),
        ...(input.status === "open"
          ? { status: { in: [...OPEN_STATUSES] } }
          : input.status === "completed"
            ? { status: "completed" }
            : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.query
          ? { title: { contains: input.query, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ scheduledStart: "asc" }, { dueDate: "asc" }, { id: "asc" }],
      take: input.limit,
      include: { tags: { select: { id: true } } },
    });
    return { result: { tasks: tasks.map(taskView) } };
  },
});

export const taskGet = defineOp({
  name: "task.get",
  description: "Read one task by id, including archived tasks.",
  risk: "read",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId, {
      includeArchived: true,
    });
    return { result: { task: taskView(task) } };
  },
});

// ---------------------------------------------------------------- writes

export const taskCreate = defineOp({
  name: "task.create",
  description:
    "Create a task. Undo archives it. Scheduling is separate: call schedule.auto to place it.",
  risk: "reversible",
  input: z
    .object({
      title: z.string().trim().min(1).max(160),
      notes: z.string().max(20000).optional(),
      dueDate: dateInputSchema.optional(),
      priority: priority.optional(),
      projectId: z.string().min(1).optional(),
      tagIds: z.array(z.string().min(1)).max(50).optional(),
      estimateMinutes: estimate.optional(),
      autoSchedule: z.boolean().default(true),
    })
    .strict(),
  async run(ctx, input) {
    if (input.projectId) await assertProjectUsable(ctx, input.projectId);
    if (input.tagIds) await assertTagsOwned(ctx, input.tagIds);
    const due = input.dueDate ? newDate(input.dueDate) : undefined;
    const task = await ctx.tx.task.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.userId,
        title: input.title,
        description: input.notes,
        status: "todo",
        priorityLevel: input.priority ?? "MEDIUM",
        projectId: input.projectId,
        estimatedMinutes: input.estimateMinutes,
        duration: input.estimateMinutes,
        dueDate: due,
        deadline: due,
        isAutoScheduled: input.autoSchedule,
        autoScheduled: false,
        scheduleLocked: false,
        ...(input.tagIds?.length
          ? { tags: { connect: input.tagIds.map((id) => ({ id })) } }
          : {}),
        activities: {
          create: {
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            action: "CREATED",
          },
        },
      },
      include: { tags: { select: { id: true } } },
    });
    return {
      result: { task: taskView(task) },
      before: null,
      inverse: { op: "task.archive", input: { taskId: task.id } },
      touched: [touched("task", task)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const taskUpdate = defineOp({
  name: "task.update",
  description:
    "Change a task's title, notes, due date, priority, project, tags, or estimate. Undo writes the previous values back.",
  risk: "reversible",
  input: z
    .object({
      taskId,
      title: z.string().trim().min(1).max(160).optional(),
      notes: z.string().max(20000).nullable().optional(),
      dueDate: dateInputSchema.nullable().optional(),
      priority: priority.optional(),
      projectId: z.string().min(1).nullable().optional(),
      tagIds: z.array(z.string().min(1)).max(50).optional(),
      estimateMinutes: estimate.nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 1, {
      message: "Nothing to update",
    }),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    const keys: (keyof RestorableFields)[] = [];

    if (input.title !== undefined) {
      data.title = input.title;
      keys.push("title");
    }
    if (input.notes !== undefined) {
      data.description = input.notes;
      keys.push("description");
    }
    if (input.dueDate !== undefined) {
      const due = input.dueDate ? newDate(input.dueDate) : null;
      data.dueDate = due;
      data.deadline = due;
      keys.push("dueDate", "deadline");
    }
    if (input.priority !== undefined) {
      data.priorityLevel = input.priority;
      keys.push("priorityLevel");
    }
    if (input.projectId !== undefined) {
      if (input.projectId) await assertProjectUsable(ctx, input.projectId);
      data.projectId = input.projectId;
      keys.push("projectId");
    }
    if (input.estimateMinutes !== undefined) {
      data.estimatedMinutes = input.estimateMinutes;
      data.duration = input.estimateMinutes;
      keys.push("estimatedMinutes", "duration");
    }
    if (input.tagIds) await assertTagsOwned(ctx, input.tagIds);

    const fields = pickRestorable(task, keys);
    const previousTagIds = task.tags.map((tag) => tag.id);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        ...data,
        ...(input.tagIds
          ? { tags: { set: input.tagIds.map((id) => ({ id })) } }
          : {}),
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: { tags: { select: { id: true } } },
    });

    return {
      result: { task: taskView(updated) },
      before: { fields, ...(input.tagIds ? { tagIds: previousTagIds } : {}) },
      inverse: {
        op: "task.restore",
        input: {
          taskId: task.id,
          fields,
          ...(input.tagIds ? { tagIds: previousTagIds } : {}),
        },
      },
      touched: [touched("task", updated)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const taskComplete = defineOp({
  name: "task.complete",
  description:
    "Mark a task completed. Undo reopens it with its previous status.",
  risk: "reversible",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    if (task.status === "completed") {
      return { result: { task: taskView(task), changed: false } };
    }
    if (task.isRecurring && task.recurrenceRule) {
      //todo: move series completion out of PUT /api/tasks/[id] into a
      // service so this op can advance recurring tasks the same way.
      throw new OpError(
        "UNSUPPORTED",
        "Recurring tasks cannot be completed through this operation yet"
      );
    }
    const fields = pickRestorable(task, ["status", "completedAt"]);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        status: "completed",
        completedAt: newDate(),
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: { tags: { select: { id: true } } },
    });
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        () => recomputeTaskActuals(task.id).then(() => undefined),
        () =>
          sendConnectorWebhook({
            userId: ctx.userId,
            event: "task.completed",
            payload: { taskId: updated.id, title: updated.title },
          }).then(() => undefined),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

export const taskUncomplete = defineOp({
  name: "task.uncomplete",
  description: "Reopen a completed task. Undo completes it again.",
  risk: "reversible",
  input: z
    .object({ taskId, status: z.enum(OPEN_STATUSES).default("todo") })
    .strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    if (task.status !== "completed") {
      return { result: { task: taskView(task), changed: false } };
    }
    const fields = pickRestorable(task, ["status", "completedAt"]);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        status: input.status,
        completedAt: null,
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: { tags: { select: { id: true } } },
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const taskArchive = defineOp({
  name: "task.archive",
  description:
    "Archive a task and release its scheduled time. Undo restores it with its previous placement.",
  risk: "reversible",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId, {
      includeArchived: true,
    });
    if (task.isArchived) {
      return { result: { task: taskView(task), changed: false } };
    }
    const fields = pickRestorable(task, [
      "isArchived",
      "archivedAt",
      "scheduledStart",
      "scheduledEnd",
      "scheduleLocked",
    ]);
    const blocks = await snapshotBlocks(ctx, task.id);
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        isArchived: true,
        archivedAt: newDate(),
        scheduledStart: null,
        scheduledEnd: null,
        scheduleLocked: false,
        ...activity(ctx, "ARCHIVED", task.workspaceId),
      },
      include: { tags: { select: { id: true } } },
    });
    await ctx.tx.scheduledBlock.deleteMany({ where: { taskId: task.id } });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields, blocks },
      inverse: {
        op: "task.restore",
        input: { taskId: task.id, fields, blocks },
      },
      touched: [touched("task", updated)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

export const taskUnarchive = defineOp({
  name: "task.unarchive",
  description: "Bring an archived task back. Undo archives it again.",
  risk: "reversible",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId, {
      includeArchived: true,
    });
    if (!task.isArchived) {
      return { result: { task: taskView(task), changed: false } };
    }
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        isArchived: false,
        archivedAt: null,
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: { tags: { select: { id: true } } },
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields: pickRestorable(task, ["isArchived", "archivedAt"]) },
      inverse: { op: "task.archive", input: { taskId: task.id } },
      touched: [touched("task", updated)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const taskMoveToDay = defineOp({
  name: "task.move_to_day",
  description:
    "Move a task to another day in the user's time zone. A placed task keeps its time of day; an unplaced task gets that day as its due date. Undo restores the previous dates and blocks.",
  risk: "reversible",
  input: z.object({ taskId, date: dayKeySchema }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const fields = pickRestorable(task, [
      "scheduledStart",
      "scheduledEnd",
      "dueDate",
    ]);
    const blocks = await snapshotBlocks(ctx, task.id);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    let shiftMs = 0;
    if (task.scheduledStart && task.scheduledEnd) {
      const start = moveInstantToDay(task.scheduledStart, input.date, timeZone);
      shiftMs = start.getTime() - task.scheduledStart.getTime();
      data.scheduledStart = start;
      data.scheduledEnd = newDate(task.scheduledEnd.getTime() + shiftMs);
    } else {
      data.dueDate = startOfZonedDay(input.date, timeZone);
    }

    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: { ...data, ...activity(ctx, "UPDATED", task.workspaceId) },
      include: { tags: { select: { id: true } } },
    });
    if (shiftMs && blocks.length) {
      await replaceBlocks(
        ctx,
        task.id,
        blocks.map((block) => ({
          ...block,
          start: newDate(
            newDate(block.start).getTime() + shiftMs
          ).toISOString(),
          end: newDate(newDate(block.end).getTime() + shiftMs).toISOString(),
        }))
      );
    }
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    return {
      result: { task: taskView(updated) },
      before: { fields, blocks },
      inverse: {
        op: "task.restore",
        input: { taskId: task.id, fields, blocks },
      },
      touched: [touched("task", updated)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

/** Inverse-only: writes a field snapshot (and optionally tags and blocks) back. */
export const taskRestore = defineOp({
  name: "task.restore",
  description: "Write a stored task snapshot back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      taskId,
      fields: restorableFields,
      tagIds: z.array(z.string()).optional(),
      blocks: z.array(blockSnapshot).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId, {
      includeArchived: true,
    });
    const keys = Object.keys(input.fields) as (keyof RestorableFields)[];
    const current = pickRestorable(task, keys);
    const currentBlocks = input.blocks
      ? await snapshotBlocks(ctx, task.id)
      : undefined;
    const currentTagIds = task.tags.map((tag) => tag.id);

    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        ...restorableToData(input.fields),
        ...(input.tagIds
          ? { tags: { set: input.tagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { tags: { select: { id: true } } },
    });
    if (input.blocks) await replaceBlocks(ctx, task.id, input.blocks);
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    return {
      result: { task: taskView(updated) },
      before: { fields: current },
      inverse: {
        op: "task.restore",
        input: {
          taskId: task.id,
          fields: current,
          ...(input.tagIds ? { tagIds: currentTagIds } : {}),
          ...(currentBlocks ? { blocks: currentBlocks } : {}),
        },
      },
      touched: [touched("task", updated)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

export const taskOps = [
  taskList,
  taskGet,
  taskCreate,
  taskUpdate,
  taskComplete,
  taskUncomplete,
  taskArchive,
  taskUnarchive,
  taskMoveToDay,
  taskRestore,
];
