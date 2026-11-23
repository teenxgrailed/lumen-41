import { queueEasyStart } from "@/services/easy-start/queue";
import { IDEA_NO_DATES } from "@/services/ideas/rules";
import type { Task } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

import { sanitizeDescriptionForStorage } from "../description-sanitizer";
import { OpError } from "../errors";
import {
  assertProjectActive,
  publishTasksUpdated,
  taskInclude,
  taskView,
  touched,
} from "../helpers";
import type { OpContext, OpRunOutput } from "../types";
import {
  type RestorableFields,
  activity,
  pickRestorable,
  snapshotBlocks,
} from "./task-snapshots";

/**
 * The parts of idea cards (openspec idea-cards) that more than one op needs:
 * making an idea, and turning a task into an idea and back. Kept apart from
 * `tasks.ts` and `ideas.ts` so neither imports the other.
 */

export type IdeaSource = "user" | "converted" | "agent";

/** Who made an idea through an op: the person, or an agent / MCP client. */
export const sourceForActor = (actor: OpContext["actor"]): IdeaSource =>
  actor === "user" ? "user" : "agent";

export { IDEA_NO_DATES };

/** An idea in a task row that is not one (or the other way round). */
export function assertIdea(task: { kind: "TASK" | "IDEA" }) {
  if (task.kind !== "IDEA") throw new OpError("INVALID_INPUT", "Not an idea");
}

export interface CreateIdeaInput {
  title: string;
  notes?: string;
  projectId?: string;
  goalId?: string;
  tagIds?: string[];
  estimateMinutes?: number;
  priority?: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  source: IdeaSource;
}

/**
 * A new idea: a task row of kind IDEA with no date, no schedule and no
 * reminder. Callers have already checked the project, goal and tags. Undo
 * archives it, as it does for a task.
 */
export async function createIdeaRow(
  ctx: OpContext,
  input: CreateIdeaInput
): Promise<OpRunOutput<{ task: ReturnType<typeof taskView> }>> {
  const task = await ctx.tx.task.create({
    data: {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      assigneeId: ctx.userId,
      title: input.title,
      description: sanitizeDescriptionForStorage(input.notes),
      status: "todo",
      kind: "IDEA",
      ideaSource: input.source,
      priorityLevel:
        input.priority && input.priority !== "NONE" ? input.priority : "MEDIUM",
      ...(input.priority === "NONE" ? { priority: "none" } : {}),
      projectId: input.projectId,
      ...(input.goalId ? { goalId: input.goalId } : {}),
      estimatedMinutes: input.estimateMinutes,
      duration: input.estimateMinutes,
      // Nothing places an idea; Take turns it into a task that is placed.
      isAutoScheduled: false,
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
    include: taskInclude,
  });
  return {
    result: { task: taskView(task) },
    before: null,
    inverse: { op: "task.archive", input: { taskId: task.id } },
    touched: [touched("task", task, null)],
    afterCommit: [publishTasksUpdated(ctx.userId)],
  };
}

/** The columns an idea must not have, with the value that clears each. */
const TO_IDEA: Record<string, unknown> = {
  kind: "IDEA",
  status: "todo",
  dueDate: null,
  deadline: null,
  startDate: null,
  scheduledStart: null,
  scheduledEnd: null,
  postponedUntil: null,
  scheduleScore: null,
  hardDeadline: false,
  isAutoScheduled: false,
  autoScheduled: false,
  scheduleLocked: false,
  isFrozen: false,
  somedayAt: null,
  somedayReason: null,
  ideaSnoozedUntil: null,
  ideaSkipCount: 0,
};

type ConvertibleTask = Task & { project: { status: string } | null };

export interface ConvertOptions {
  to: "idea" | "task";
  /** converted (the sweep), user or agent: stored as the idea's source. */
  source: IdeaSource;
}

/**
 * Turn a task into an idea, or an idea into a plain task, in one write with one
 * inverse. To an idea: the due date, deadline, start, schedule, blocks, pin and
 * Someday are cleared and unsent reminders cancelled in the same step; the old
 * values are in the snapshot, so undo brings the task back. Undo also stamps
 * `ideaCheckedAt`, so the sweep never converts it again.
 *
 * To a task: no placement (Take places it), the snooze is cleared, and the
 * sweep is told to leave it a task.
 */
export async function convertTask(
  ctx: OpContext,
  task: ConvertibleTask,
  options: ConvertOptions
) {
  assertProjectActive(task);
  const now = newDate();

  if (options.to === "task") {
    if (task.kind !== "IDEA") {
      return { result: { task: taskView(task), changed: false } };
    }
    const keys: (keyof RestorableFields)[] = [
      "kind",
      "ideaSnoozedUntil",
      "ideaCheckedAt",
      "isAutoScheduled",
    ];
    const fields = pickRestorable(task, keys);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        kind: "TASK",
        ideaSnoozedUntil: null,
        // The person decided: the sweep leaves it a task.
        ideaCheckedAt: now,
        // A new task, as any other: the scheduler may place it later.
        isAutoScheduled: true,
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
      include: taskInclude,
    });
    return {
      result: { task: taskView(updated), changed: true },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated, task)],
      afterCommit: [
        publishTasksUpdated(ctx.userId),
        () => queueEasyStart(updated),
      ],
    };
  }

  if (task.kind === "IDEA") {
    return { result: { task: taskView(task), changed: false } };
  }
  // An idea is the person's own, offered to them: not a shared task.
  if (
    (task.userId && task.userId !== ctx.userId) ||
    (task.assigneeId && task.assigneeId !== ctx.userId)
  ) {
    throw new OpError("INVALID_INPUT", "Only your own task can be an idea");
  }
  if (task.status !== "todo") {
    throw new OpError(
      "CONFLICT",
      task.status === "completed"
        ? "A completed task cannot be an idea"
        : "A task in progress cannot be an idea"
    );
  }
  if (task.isRecurring || task.recurrenceMasterId || task.habitId) {
    throw new OpError(
      "INVALID_INPUT",
      "A repeating task or a habit cannot be an idea"
    );
  }
  if (task.externalTaskId) {
    throw new OpError("INVALID_INPUT", "A synced task cannot be an idea");
  }
  if (task.isSample) {
    throw new OpError("INVALID_INPUT", "An example task cannot be an idea");
  }
  const inPlan = await ctx.tx.dayPlanItem.count({
    where: {
      taskId: task.id,
      plan: { status: { in: ["draft", "active"] } },
    },
  });
  if (inPlan > 0) {
    throw new OpError("CONFLICT", "The task is in the day plan");
  }

  // Something still waits on it: it is work, not an optional thing.
  const [dependents, edges, projectBlocks] = await Promise.all([
    ctx.tx.task.count({
      where: {
        dependsOnId: task.id,
        status: { not: "completed" },
        isArchived: false,
        trashedAt: null,
      },
    }),
    ctx.tx.taskDependency.count({
      where: {
        blockerTaskId: task.id,
        removedAt: null,
        blocked: { status: { not: "completed" }, isArchived: false },
      },
    }),
    ctx.tx.projectBlocker.count({
      where: { blockerTaskId: task.id, resolvedAt: null },
    }),
  ]);
  if (dependents + edges + projectBlocks > 0) {
    throw new OpError(
      "CONFLICT",
      "Other tasks are waiting on this task. Remove that dependency first."
    );
  }

  const keys = [
    ...Object.keys(TO_IDEA),
    "ideaSource",
    "ideaCheckedAt",
  ] as (keyof RestorableFields)[];
  const fields = pickRestorable(task, keys);
  const blocks = await snapshotBlocks(ctx, task.id);
  const pending = await ctx.tx.taskReminder.findMany({
    where: { taskId: task.id, canceledAt: null, deliveredAt: null },
    select: { id: true },
  });
  const reminderIds = pending.map((reminder) => reminder.id);

  const updated = await ctx.tx.task.update({
    where: { id: task.id },
    data: {
      ...(TO_IDEA as Record<string, never>),
      scheduleAtRisk: false,
      ideaSource: options.source,
      // The sweep looked at it; an undone conversion is not redone.
      ideaCheckedAt: now,
      ...activity(ctx, "UPDATED", task.workspaceId),
    },
    include: taskInclude,
  });
  await ctx.tx.scheduledBlock.deleteMany({ where: { taskId: task.id } });
  if (reminderIds.length) {
    await ctx.tx.taskReminder.updateMany({
      where: { id: { in: reminderIds } },
      data: { canceledAt: now },
    });
  }
  return {
    result: { task: taskView(updated), changed: true },
    before: { fields, blocks, reminderIds },
    inverse: {
      op: "task.restore",
      input: {
        taskId: task.id,
        fields,
        blocks,
        ...(reminderIds.length ? { uncancelReminderIds: reminderIds } : {}),
        markIdeaChecked: true,
      },
    },
    touched: [touched("task", updated, task)],
    afterCommit: [
      // The calendar event its block left behind is removed.
      () => schedulePushTaskBlock(task.assigneeId ?? ctx.userId, task.id),
      publishTasksUpdated(ctx.userId),
    ],
  };
}
