import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import {
  SPREAD_DEFAULT_DAYS,
  spreadAcrossDays,
  spreadMinutes,
  spreadOrder,
  taskDayInZone,
} from "@/services/scheduling/spread";
import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import {
  TASK_ATTACHMENT_MAX_BYTES,
  TaskAttachmentError,
  addTaskAttachment,
  deleteTaskAttachment,
} from "@/services/tasks/attachments";
import { deadlineForPatch } from "@/services/tasks/deadline";
import {
  planRecurringCompletion,
  upsertRecurringOccurrence,
} from "@/services/tasks/recurring-completion";
import {
  checkBlocker,
  entrySchema,
  normalizeSubtasks,
  partsCreateData,
  subtaskListSchema,
} from "@/services/tasks/subtasks";
import {
  hasPlacement,
  placementFields,
  planPlacement,
  writeFrozenPlacement,
} from "@/services/tasks/task-placement";
import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import type { Prisma } from "@prisma/client";
import { RRule } from "rrule";
import { z } from "zod";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { schedulePushTaskBlock } from "@/lib/task-block-push";
import { defaultTaskReminderRows } from "@/lib/task-default-reminders";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";
import { normalizeRecurrenceRule } from "@/lib/utils/normalize-recurrence-rules";

import { OpError } from "../errors";
import {
  assertProjectActive,
  dateInputSchema,
  dateOrNull,
  dayKeySchema,
  findScopedProject,
  findScopedTask,
  isoOrNull,
  moveInstantToDay,
  nextDayKey,
  publishTasksUpdated,
  startOfZonedDay,
  taskInclude,
  taskView,
  touched,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext, TouchedRow } from "../types";

const taskId = z.string().min(1);
/** NONE is "No priority"; it is stored in the legacy `priority` column. */
const priority = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const levelPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
/** An RRULE such as FREQ=WEEKLY;BYDAY=MO. Parsed, not just shaped. */
const recurrenceRule = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => {
      try {
        RRule.fromString(normalizeRecurrenceRule(value) ?? "");
        return true;
      } catch {
        return false;
      }
    },
    { message: "Expected an RRULE such as FREQ=WEEKLY;BYDAY=MO" }
  );
const estimate = z.number().int().min(5).max(1440);
const OPEN_STATUSES = ["todo", "in_progress"] as const;
/** The most tasks one spread (or its undo) moves. */
const SPREAD_MAX_TASKS = 100;

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
    priorityLevel: levelPriority,
    priority: z.string().nullable(),
    isRecurring: z.boolean(),
    recurrenceRule: z.string().nullable(),
    scheduleId: z.string().nullable(),
    projectId: z.string().nullable(),
    estimatedMinutes: z.number().int().nullable(),
    duration: z.number().int().nullable(),
    completedAt: isoOrNull,
    isArchived: z.boolean(),
    archivedAt: isoOrNull,
    scheduledStart: isoOrNull,
    scheduledEnd: isoOrNull,
    scheduleLocked: z.boolean(),
    isAutoScheduled: z.boolean(),
    autoScheduled: z.boolean(),
    scheduleScore: z.number().nullable(),
    startDate: isoOrNull,
    lastCompletedDate: isoOrNull,
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
  "startDate",
  "lastCompletedDate",
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

async function snapshotBlocks(
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

async function replaceBlocks(
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

/** Hours: a schedule the task's planner owns, as PUT /api/tasks/[id] checks it. */
async function assertScheduleOwned(
  ctx: OpContext,
  scheduleId: string,
  userId: string
) {
  const schedule = await ctx.tx.workSchedule.findFirst({
    where: { id: scheduleId, userId },
    select: { id: true },
  });
  if (!schedule) throw new OpError("INVALID_INPUT", "Unknown work schedule");
}

async function assertProjectUsable(ctx: OpContext, projectId: string) {
  const project = await findScopedProject(ctx, projectId);
  if (project.status === "archived") {
    throw new OpError("CONFLICT", "That project is archived");
  }
}

/** A refused placement as an op error: 409 is a conflict, the rest bad input. */
function placementError(plan: { status: number; error: string }) {
  return new OpError(
    plan.status === 409 ? "CONFLICT" : "INVALID_INPUT",
    plan.error
  );
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
      include: taskInclude,
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
    "Create a task. Undo archives it. With start (ISO 8601, or a wall-clock time in the user's zone) the task is placed at that time and pinned there, as a drop on the calendar does, and autoSchedule defaults to false; without it, scheduling is separate: call schedule.auto to place it.",
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
      recurrenceRule: recurrenceRule.optional(),
      scheduleId: z.string().min(1).optional(),
      start: placementFields.start,
      autoSchedule: placementFields.autoSchedule,
      entry: entrySchema.optional(),
      subtasks: subtaskListSchema.optional(),
      dependsOnId: z.string().min(1).optional(),
    })
    .strict(),
  async run(ctx, input) {
    if (input.projectId) await assertProjectUsable(ctx, input.projectId);
    if (input.dependsOnId) {
      const blocker = await checkBlocker(
        { userId: ctx.userId, workspace: ctx.workspace },
        input.dependsOnId
      );
      if (!blocker.ok) throw new OpError("INVALID_INPUT", blocker.error);
    }
    const subtasks = normalizeSubtasks(input.subtasks);
    if (input.tagIds) await assertTagsOwned(ctx, input.tagIds);
    if (input.scheduleId)
      await assertScheduleOwned(ctx, input.scheduleId, ctx.userId);
    const rule = input.recurrenceRule
      ? normalizeRecurrenceRule(input.recurrenceRule)
      : undefined;
    const due = input.dueDate ? newDate(input.dueDate) : undefined;
    // `start` places and pins it as the calendar does (see task-placement).
    const plan = await planPlacement({
      userId: ctx.userId,
      schedulingUserId: ctx.userId,
      task: {
        scheduledStart: null,
        scheduledEnd: null,
        estimatedMinutes: input.estimateMinutes ?? null,
        duration: null,
      },
      placement: { start: input.start, autoSchedule: input.autoSchedule },
    });
    if (plan && !plan.ok) throw placementError(plan);
    const placed = plan?.data ?? {};
    const task = await ctx.tx.task.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.userId,
        title: input.title,
        description: sanitizeTaskDescriptionForStorage(input.notes),
        status: "todo",
        priorityLevel:
          input.priority && input.priority !== "NONE"
            ? input.priority
            : "MEDIUM",
        ...(input.priority === "NONE" ? { priority: "none" } : {}),
        isRecurring: !!rule,
        recurrenceRule: rule,
        scheduleId: input.scheduleId,
        projectId: input.projectId,
        ...(input.dependsOnId ? { dependsOnId: input.dependsOnId } : {}),
        entry: input.entry ?? null,
        parts: partsCreateData(subtasks),
        estimatedMinutes: input.estimateMinutes,
        duration: input.estimateMinutes,
        // A placed task without a due date is due on its placed day.
        dueDate: due ?? placed.dueDate,
        deadline: due,
        // Same as /api/connect/tasks: the scheduler may place it. Unlike that
        // route nothing is placed yet, so autoScheduled stays false until
        // schedule.auto (or the next scheduler run) places it.
        isAutoScheduled: placed.isAutoScheduled ?? input.autoSchedule ?? true,
        autoScheduled: false,
        scheduleLocked: placed.scheduleLocked ?? false,
        scheduledStart: placed.scheduledStart,
        scheduledEnd: placed.scheduledEnd,
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
      include: taskInclude,
    });
    // Same default reminders as POST /api/tasks.
    await ctx.tx.taskReminder.createMany({
      data: defaultTaskReminderRows(
        await getPlan(ctx.userId),
        task,
        task.assigneeId ?? ctx.userId
      ),
      skipDuplicates: true,
    });
    if (plan?.ok && plan.frozen) {
      await writeFrozenPlacement(
        { taskId: task.id, userId: ctx.userId, ...plan.frozen },
        ctx.tx
      );
    }
    return {
      result: { task: taskView(task) },
      before: null,
      // Archiving releases the placed time and its block along with the task.
      inverse: { op: "task.archive", input: { taskId: task.id } },
      touched: [touched("task", task, null)],
      afterCommit: [
        ...(plan?.ok && plan.frozen
          ? [() => schedulePushTaskBlock(ctx.userId, task.id)]
          : []),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

export const taskUpdate = defineOp({
  name: "task.update",
  description:
    "Change a task's title, notes, due date, deadline (follows the due date unless set), priority (NONE clears it), project, tags, estimate, repeat (an RRULE, or null to stop repeating) or hours (a work schedule id). Placement: start places the task at that time and pins it (the due day becomes that day), pinned pins it where it is or hands it back to the scheduler, autoSchedule turns the scheduler on or off for it; a blocked-out time is refused. Undo writes the previous values back, the placement and its pinned block included.",
  risk: "reversible",
  input: z
    .object({
      taskId,
      title: z.string().trim().min(1).max(160).optional(),
      notes: z.string().max(20000).nullable().optional(),
      dueDate: dateInputSchema.nullable().optional(),
      deadline: dateInputSchema.nullable().optional(),
      priority: priority.optional(),
      projectId: z.string().min(1).nullable().optional(),
      tagIds: z.array(z.string().min(1)).max(50).optional(),
      estimateMinutes: estimate.nullable().optional(),
      recurrenceRule: recurrenceRule.nullable().optional(),
      scheduleId: z.string().min(1).nullable().optional(),
      ...placementFields,
    })
    .strict()
    .refine((value) => Object.keys(value).length > 1, {
      message: "Nothing to update",
    }),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    assertProjectActive(task);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    const keys: (keyof RestorableFields)[] = [];

    if (input.title !== undefined) {
      data.title = input.title;
      keys.push("title");
    }
    if (input.notes !== undefined) {
      data.description =
        input.notes === null
          ? null
          : (sanitizeTaskDescriptionForStorage(input.notes) ?? null);
      keys.push("description");
    }
    if (input.dueDate !== undefined || input.deadline !== undefined) {
      const due =
        input.dueDate === undefined
          ? undefined
          : input.dueDate
            ? newDate(input.dueDate)
            : null;
      const hard =
        input.deadline === undefined
          ? undefined
          : input.deadline
            ? newDate(input.deadline)
            : null;
      if (due !== undefined) {
        data.dueDate = due;
        keys.push("dueDate");
      }
      // An explicit deadline wins; a moved due date drags an equal one along.
      const nextDeadline = deadlineForPatch(task, {
        dueDate: due,
        deadline: hard,
      });
      if (nextDeadline !== undefined) {
        data.deadline = nextDeadline;
        keys.push("deadline");
      }
    }
    if (input.priority !== undefined) {
      if (input.priority === "NONE") {
        data.priority = "none";
        keys.push("priority");
      } else {
        data.priorityLevel = input.priority;
        // Picking a real priority ends "No priority".
        data.priority = null;
        keys.push("priorityLevel", "priority");
      }
    }
    if (input.recurrenceRule !== undefined) {
      const rule = input.recurrenceRule
        ? normalizeRecurrenceRule(input.recurrenceRule)
        : null;
      data.recurrenceRule = rule;
      data.isRecurring = !!rule;
      keys.push("recurrenceRule", "isRecurring");
    }
    if (input.scheduleId !== undefined) {
      if (input.scheduleId)
        await assertScheduleOwned(
          ctx,
          input.scheduleId,
          task.assigneeId ?? ctx.userId
        );
      data.scheduleId = input.scheduleId;
      keys.push("scheduleId");
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

    // Placing by hand goes through the rule the connector and the app share.
    const placementInput = {
      start: input.start,
      pinned: input.pinned,
      autoSchedule: input.autoSchedule,
    };
    const placing = hasPlacement(placementInput);
    let frozen: { start: Date; end: Date } | null = null;
    if (placing) {
      const plan = await planPlacement({
        userId: ctx.userId,
        schedulingUserId: task.assigneeId,
        task,
        placement: placementInput,
        estimatedMinutes: input.estimateMinutes,
      });
      if (plan && !plan.ok) throw placementError(plan);
      if (plan) {
        const { dueDate, ...placed } = plan.data;
        Object.assign(data, placed);
        keys.push(...(Object.keys(placed) as (keyof RestorableFields)[]));
        // The placed day becomes the due day, as in the app; an explicit
        // dueDate in the same call wins and the deadline is left alone.
        if (dueDate && input.dueDate === undefined) {
          data.dueDate = dueDate;
          keys.push("dueDate");
        }
        frozen = plan.frozen;
      }
    }

    const fields = pickRestorable(task, keys);
    const previousTagIds = task.tags.map((tag) => tag.id);
    // The frozen block replaces every block of the task, so undo puts them all back.
    const blocks = frozen ? await snapshotBlocks(ctx, task.id) : undefined;
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        ...data,
        ...(input.tagIds
          ? { tags: { set: input.tagIds.map((id) => ({ id })) } }
          : {}),
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: taskInclude,
    });
    if (frozen && task.assigneeId) {
      await writeFrozenPlacement(
        { taskId: task.id, userId: task.assigneeId, ...frozen },
        ctx.tx
      );
    }
    const schedulingUserId = task.assigneeId ?? ctx.userId;

    return {
      result: { task: taskView(updated) },
      before: {
        fields,
        ...(input.tagIds ? { tagIds: previousTagIds } : {}),
        ...(blocks ? { blocks } : {}),
      },
      inverse: {
        op: "task.restore",
        input: {
          taskId: task.id,
          fields,
          ...(input.tagIds ? { tagIds: previousTagIds } : {}),
          ...(blocks ? { blocks } : {}),
        },
      },
      touched: [touched("task", updated, task)],
      afterCommit: [
        ...(placing
          ? [() => schedulePushTaskBlock(schedulingUserId, task.id)]
          : []),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

/**
 * Completing a series: the occurrence is recorded as its own finished task
 * and the same task jumps to its next date, exactly as PUT /api/tasks/[id]
 * does. A series with no next date is simply completed.
 */
async function completeOccurrence(
  ctx: OpContext,
  task: Awaited<ReturnType<typeof findScopedTask>>
) {
  const now = newDate();
  let plan: ReturnType<typeof planRecurringCompletion>;
  try {
    plan = planRecurringCompletion(task, now);
  } catch {
    throw new OpError("INVALID_INPUT", "The task's repeat rule cannot be read");
  }
  const keys: (keyof RestorableFields)[] = [
    "status",
    "completedAt",
    "dueDate",
    "startDate",
    "scheduledStart",
    "scheduledEnd",
    "lastCompletedDate",
  ];
  const fields = pickRestorable(task, keys);
  await upsertRecurringOccurrence(ctx.tx, task, plan.completion, ctx.userId);
  const data: Prisma.TaskUncheckedUpdateInput = plan.advance
    ? { ...plan.advance }
    : { status: "completed", completedAt: now };
  const updated = await ctx.tx.task.update({
    where: { id: task.id },
    data: { ...data, ...activity(ctx, "UPDATED", task.workspaceId) },
    include: taskInclude,
  });
  const schedulingUserId = task.assigneeId ?? ctx.userId;
  return {
    result: { task: taskView(updated), changed: true },
    before: { fields },
    inverse: {
      op: "task.restore",
      input: {
        taskId: task.id,
        fields,
        removeOccurrenceAt: plan.completion.occurrenceAt.toISOString(),
      },
    },
    touched: [touched("task", updated, task)],
    afterCommit: [
      () => schedulePushTaskBlock(schedulingUserId, task.id),
      () =>
        sendConnectorWebhook({
          userId: ctx.userId,
          event: "task.completed",
          payload: { taskId: updated.id, title: updated.title },
        }).then(() => undefined),
      publishTasksUpdated(ctx.userId),
    ],
  };
}

export const taskComplete = defineOp({
  name: "task.complete",
  description:
    "Mark a task completed. Undo reopens it with its previous status.",
  risk: "reversible",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    assertProjectActive(task);
    if (task.status === "completed") {
      return { result: { task: taskView(task), changed: false } };
    }
    if (task.isRecurring && task.recurrenceRule) {
      return completeOccurrence(ctx, task);
    }
    const fields = pickRestorable(task, ["status", "completedAt"]);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        status: "completed",
        completedAt: newDate(),
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: taskInclude,
    });
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated, task)],
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
      include: taskInclude,
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated, task)],
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
    const schedulingUserId = task.assigneeId ?? ctx.userId;
    const blocks = await snapshotBlocks(ctx, task.id, schedulingUserId);
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
      include: taskInclude,
    });
    // Same scope as DELETE /api/tasks/[id]: only the scheduling user's blocks.
    await ctx.tx.scheduledBlock.deleteMany({
      where: { taskId: task.id, userId: schedulingUserId },
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields, blocks },
      inverse: {
        op: "task.restore",
        input: {
          taskId: task.id,
          fields,
          blocks,
          blocksUserId: schedulingUserId,
        },
      },
      touched: [touched("task", updated, task)],
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
      include: taskInclude,
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields: pickRestorable(task, ["isArchived", "archivedAt"]) },
      inverse: { op: "task.archive", input: { taskId: task.id } },
      touched: [touched("task", updated, task)],
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
    assertProjectActive(task);
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
      include: taskInclude,
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
      touched: [touched("task", updated, task)],
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
      /** Undo of completing a series: drop the finished occurrence it made. */
      removeOccurrenceAt: z.string().datetime({ offset: true }).optional(),
      blocks: z.array(blockSnapshot).optional(),
      blocksUserId: z.string().optional(),
    })
    .strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId, {
      includeArchived: true,
    });
    const keys = Object.keys(input.fields) as (keyof RestorableFields)[];
    const current = pickRestorable(task, keys);
    const currentBlocks = input.blocks
      ? await snapshotBlocks(ctx, task.id, input.blocksUserId)
      : undefined;
    const currentTagIds = task.tags.map((tag) => tag.id);

    if (input.removeOccurrenceAt) {
      await ctx.tx.task.deleteMany({
        where: {
          recurrenceMasterId: task.id,
          recurrenceInstanceAt: newDate(input.removeOccurrenceAt),
        },
      });
    }
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        ...restorableToData(input.fields),
        ...(input.tagIds
          ? { tags: { set: input.tagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: taskInclude,
    });
    if (input.blocks) {
      await replaceBlocks(ctx, task.id, input.blocks, input.blocksUserId);
    }
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
          ...(input.blocksUserId ? { blocksUserId: input.blocksUserId } : {}),
        },
      },
      touched: [touched("task", updated, task)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

/** Inverse-only: writes several task snapshots back, as one undo. */
export const taskRestoreMany = defineOp({
  name: "task.restore_many",
  description: "Write several stored task snapshots back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      items: z.array(taskRestore.input).min(1).max(SPREAD_MAX_TASKS),
    })
    .strict(),
  async run(ctx, input) {
    const owners = await ctx.tx.task.findMany({
      where: {
        id: { in: input.items.map((item) => item.taskId) },
        ...ctx.scope,
      },
      select: { id: true, assigneeId: true },
    });
    const outputs = [];
    for (const item of input.items) {
      outputs.push(await taskRestore.run(ctx, item));
    }
    return {
      result: {
        restoredTaskIds: outputs.map((output) => output.result.task.id),
      },
      before: { taskIds: input.items.map((item) => item.taskId) },
      inverse: {
        op: "task.restore_many",
        input: {
          items: outputs.map((output) => output.inverse?.input),
        },
      },
      touched: outputs.flatMap((output) => output.touched ?? []),
      afterCommit: [
        ...owners.map(
          (task) => () =>
            schedulePushTaskBlock(task.assigneeId ?? ctx.userId, task.id)
        ),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

type SpreadRow = { taskId: string; title: string; date: string };

export const taskSpread = defineOp({
  name: "task.spread",
  description:
    "Spread open tasks over the coming days: each goes to the first day, from today, that still has room for it (that day's working hours less events, personal time and the tasks already on it). Give taskIds, or scope: today (today's tasks with no time today) or overdue (open tasks due before today). One that fits today stays on today; one that fits nowhere stays where it is. The due day moves and a placed task keeps its time of day. Undo puts every task back.",
  risk: "reversible",
  input: z
    .object({
      taskIds: z.array(taskId).min(1).max(SPREAD_MAX_TASKS).optional(),
      scope: z.enum(["today", "overdue"]).optional(),
      days: z.number().int().min(1).max(14).optional(),
    })
    .strict()
    .refine((value) => !value.taskIds !== !value.scope, {
      message: "Give either taskIds or scope",
    }),
  async run(ctx, input) {
    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const now = newDate();
    const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
    const todayStart = startOfZonedDay(today, timeZone);
    const tomorrowStart = startOfZonedDay(nextDayKey(today), timeZone);
    const found = await ctx.tx.task.findMany({
      where: {
        ...ctx.scope,
        isArchived: false,
        noSlot: false,
        scheduleLocked: false,
        status: { in: [...OPEN_STATUSES] },
        ...(input.taskIds
          ? { id: { in: input.taskIds } }
          : input.scope === "overdue"
            ? { dueDate: { lt: tomorrowStart } }
            : {
                OR: [
                  { dueDate: { gte: todayStart, lt: tomorrowStart } },
                  { scheduledStart: { gte: todayStart, lt: tomorrowStart } },
                ],
              }),
      },
      include: { ...taskInclude, project: { select: { status: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: SPREAD_MAX_TASKS,
    });
    const timedToday = (task: (typeof found)[number]) =>
      !!task.scheduledStart &&
      formatInTimeZone(task.scheduledStart, timeZone, "yyyy-MM-dd") === today;
    const candidates = found.filter((task) => {
      if (task.project?.status === "archived") return false;
      if (input.taskIds) return true;
      const day = taskDayInZone(task, today, timeZone);
      return input.scope === "overdue"
        ? !!day && day < today
        : day === today && !timedToday(task);
    });
    const asked = input.taskIds;
    const ordered = spreadOrder(
      asked
        ? [...candidates].sort(
            (a, b) => asked.indexOf(a.id) - asked.indexOf(b.id)
          )
        : candidates
    );

    const days = await loadSpreadDays({
      userId: ctx.userId,
      workspace: ctx.workspace,
      timeZone,
      today,
      days: input.days ?? SPREAD_DEFAULT_DAYS,
      now,
      exclude: new Set(ordered.map((task) => task.id)),
    });
    const plan = spreadAcrossDays(
      ordered.map((task) => ({ id: task.id, minutes: spreadMinutes(task) })),
      days
    );

    const byId = new Map(ordered.map((task) => [task.id, task]));
    const moved: SpreadRow[] = [];
    const stayed: SpreadRow[] = [];
    const items: Array<{
      taskId: string;
      fields: RestorableFields;
      blocks: BlockSnapshot[];
    }> = [];
    const touchedRows: TouchedRow[] = [];
    for (const { id, date } of plan.placed) {
      const task = byId.get(id)!;
      if (taskDayInZone(task, today, timeZone) === date) {
        stayed.push({ taskId: id, title: task.title, date });
        continue;
      }
      const fields = pickRestorable(task, [
        "dueDate",
        "deadline",
        "scheduledStart",
        "scheduledEnd",
      ]);
      const blocks = await snapshotBlocks(ctx, task.id);
      const dueDate = startOfZonedDay(date, timeZone);
      const data: Prisma.TaskUncheckedUpdateInput = { dueDate };
      const deadline = deadlineForPatch(task, { dueDate });
      if (deadline !== undefined) data.deadline = deadline;
      let shiftMs = 0;
      if (task.scheduledStart && task.scheduledEnd) {
        const start = moveInstantToDay(task.scheduledStart, date, timeZone);
        shiftMs = start.getTime() - task.scheduledStart.getTime();
        data.scheduledStart = start;
        data.scheduledEnd = newDate(task.scheduledEnd.getTime() + shiftMs);
      }
      const updated = await ctx.tx.task.update({
        where: { id: task.id },
        data: { ...data, ...activity(ctx, "UPDATED", task.workspaceId) },
        select: { id: true, updatedAt: true },
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
      items.push({ taskId: task.id, fields, blocks });
      touchedRows.push(touched("task", updated, task));
      moved.push({ taskId: id, title: task.title, date });
    }

    return {
      result: {
        today,
        moved,
        stayed,
        unplaced: plan.unplaced.map((id) => ({
          taskId: id,
          title: byId.get(id)!.title,
        })),
      },
      before: { items },
      inverse: items.length
        ? { op: "task.restore_many", input: { items } }
        : null,
      touched: touchedRows,
      afterCommit: items.length
        ? [
            ...moved.map(({ taskId: id }) => {
              const owner = byId.get(id)!.assigneeId ?? ctx.userId;
              return () => schedulePushTaskBlock(owner, id);
            }),
            publishTasksUpdated(ctx.userId),
          ]
        : [],
    };
  },
});

/** Base64 of a 4 MB file is a third longer. */
const ATTACHMENT_BASE64_MAX =
  Math.ceil((TASK_ATTACHMENT_MAX_BYTES * 4) / 3) + 8;

async function removeAttachment(
  ctx: OpContext,
  input: { taskId: string; attachmentId: string }
) {
  const task = await findScopedTask(ctx, input.taskId);
  assertProjectActive(task);
  try {
    await deleteTaskAttachment(task.id, input.attachmentId, ctx.tx);
  } catch (error) {
    if (error instanceof TaskAttachmentError)
      throw new OpError("NOT_FOUND", error.message);
    throw error;
  }
  return { result: { removed: input.attachmentId } };
}

export const taskAttach = defineOp({
  name: "task.attach",
  description:
    "Attach a file to a task: an image (JPEG, PNG, WebP, GIF) or a PDF, up to 4 MB, ten per task. contentBase64 holds the file's bytes; the type is read from them. Undo removes it.",
  risk: "reversible",
  input: z
    .object({
      taskId,
      name: z.string().trim().min(1).max(240),
      contentBase64: z.string().min(1).max(ATTACHMENT_BASE64_MAX),
    })
    .strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    assertProjectActive(task);
    let attachment;
    try {
      attachment = await addTaskAttachment(
        {
          taskId: task.id,
          userId: ctx.userId,
          name: input.name,
          bytes: Buffer.from(input.contentBase64, "base64"),
        },
        ctx.tx
      );
    } catch (error) {
      if (error instanceof TaskAttachmentError)
        throw new OpError("INVALID_INPUT", error.message);
      throw error;
    }
    return {
      result: { attachment },
      inverse: {
        op: "task.attachment_remove",
        input: { taskId: task.id, attachmentId: attachment.id },
      },
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const taskDetach = defineOp({
  name: "task.detach",
  description:
    "Remove a file from a task. The file's bytes are deleted and cannot be restored.",
  risk: "irreversible",
  input: z.object({ taskId, attachmentId: z.string().min(1) }).strict(),
  async run(ctx, input) {
    const out = await removeAttachment(ctx, input);
    return { ...out, afterCommit: [publishTasksUpdated(ctx.userId)] };
  },
});

/** Inverse-only: undoes `task.attach`. */
export const taskAttachmentRemove = defineOp({
  name: "task.attachment_remove",
  description: "Remove a just-added attachment. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ taskId, attachmentId: z.string().min(1) }).strict(),
  async run(ctx, input) {
    const out = await removeAttachment(ctx, input);
    return { ...out, afterCommit: [publishTasksUpdated(ctx.userId)] };
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
  taskRestoreMany,
  taskSpread,
  taskAttach,
  taskDetach,
  taskAttachmentRemove,
];
