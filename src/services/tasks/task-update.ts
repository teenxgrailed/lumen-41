import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { endFocusForCompletedTask } from "@/services/focus/completion-ends-focus";
import { getPage } from "@/services/pages/page-service";
import { rescheduleRemindersSoon } from "@/services/reminders/reminders";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { deadlineForPatch } from "@/services/tasks/deadline";
import { findTaskProjectMoveConflict } from "@/services/tasks/dependencies";
import {
  type RecurringAlreadyDone,
  type RecurringCompletion,
  planRecurringCompletion,
  recurringAlreadyDone,
  upsertRecurringOccurrence,
} from "@/services/tasks/recurring-completion";
import { checkBlocker } from "@/services/tasks/subtasks";
import {
  checkLabelsAndHours,
  parseRepeatRule,
} from "@/services/tasks/task-fields";
import {
  type PlacementInput,
  planPlacement,
  writeFrozenPlacement,
} from "@/services/tasks/task-placement";
import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import type {
  Prisma,
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  Task,
} from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { DOC_ORIGIN } from "@/lib/needt3/origin-page";
import { prisma } from "@/lib/prisma";
import { schedulePushTaskBlock } from "@/lib/task-block-push";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";
import {
  ChangeType,
  TaskChangeTracker,
} from "@/lib/task-sync/task-change-tracker";

import { TaskStatus } from "@/types/task";

const LOG_SOURCE = "task-update-service";

/**
 * The task fields an external caller may change; nothing else is written.
 * `start`, `pinned` and `autoSchedule` place the task by hand (see
 * services/tasks/task-placement).
 */
export interface TaskFieldPatch extends PlacementInput {
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  /**
   * The hard date the scheduler must beat. When omitted, a changed `dueDate`
   * moves it along if the two were equal before.
   */
  deadline?: Date | null;
  estimatedMinutes?: number | null;
  priorityLevel?: SchedulingTaskPriority;
  /** "No priority" (the legacy `priority` column reads "none"). */
  noPriority?: boolean;
  /** An RRULE, e.g. FREQ=WEEKLY;BYDAY=MO; null stops the repeat. */
  recurrenceRule?: string | null;
  /** The whole set of labels (Tag ids); the person's own. */
  tagIds?: string[];
  /** The work schedule ("Hours"); null = the default one. */
  scheduleId?: string | null;
  energyRequired?: SchedulingEnergyLevel;
  status?: TaskStatus;
  projectId?: string | null;
  /** The two-minute first step; null clears it. */
  entry?: string | null;
  /** The one open task this waits on; null clears it. */
  dependsOnId?: string | null;
  /** The page the task came from (originKind "doc" + originId); null detaches. */
  originPageId?: string | null;
  /** "Do for the full time": true/false is the person's choice, null = auto. */
  fullTime?: boolean | null;
  /** The goal the task moves forward; null unlinks it. */
  goalId?: string | null;
}

export type TaskUpdateResult =
  | {
      ok: true;
      task: Task;
      changed: boolean;
      /**
       * Set when the status change was a repeat tick on a recurring task that
       * is already done for today: the task was left as it is and this says
       * when it comes due next.
       */
      recurringAlreadyDone?: RecurringAlreadyDone;
    }
  | { ok: false; status: number; error: string };

/**
 * Updates whitelisted fields of one task in the caller's workspace with the
 * same rules and side effects as `PUT /api/tasks/[id]`: archived tasks and
 * archived projects are read-only, a project move must stay in the workspace
 * and clear dependencies, completing records `completedAt`, advances a
 * recurring series, recomputes actuals and sends `task.completed`, and the
 * calendar block is re-pushed. The scheduler then runs, like the connector's
 * other task writes.
 */
export async function updateTaskFields(input: {
  userId: string;
  workspace: WorkspaceAccess;
  taskId: string;
  patch: TaskFieldPatch;
}): Promise<TaskUpdateResult> {
  const { userId, workspace, taskId, patch } = input;
  const scope = workspaceDataScopeWhere(workspace, userId);
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...scope },
    include: { tags: true, project: { select: { status: true } } },
  });
  if (!task) return { ok: false, status: 404, error: "Task not found" };
  if (task.isArchived) {
    return {
      ok: false,
      status: 409,
      error:
        "Archived tasks are read-only. Restore the task before editing it.",
    };
  }
  if (task.project?.status === "archived") {
    return { ok: false, status: 409, error: "PROJECT_ARCHIVED" };
  }

  const workspaceId = task.workspaceId ?? workspace.workspaceId;
  const { projectId } = patch;
  if (
    projectId &&
    !(await prisma.project.findFirst({
      where: { id: projectId, workspaceId, status: "active" },
      select: { id: true },
    }))
  ) {
    return { ok: false, status: 400, error: "Invalid workspace project" };
  }
  if (projectId !== undefined && projectId !== task.projectId) {
    const conflict = await findTaskProjectMoveConflict({
      userId,
      workspace,
      taskId,
      targetProjectId: projectId,
    });
    if (conflict) {
      return {
        ok: false,
        status: 409,
        error: `Cannot move task while it is linked to “${conflict.task.title}”. Remove that dependency first.`,
      };
    }
  }

  const checked = await checkLabelsAndHours({
    userId,
    schedulingUserId: task.assigneeId ?? userId,
    tagIds: patch.tagIds,
    scheduleId: patch.scheduleId,
  });
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  let repeat: string | null | undefined;
  if (patch.recurrenceRule !== undefined) {
    repeat =
      patch.recurrenceRule === null
        ? null
        : parseRepeatRule(patch.recurrenceRule);
    if (repeat === null && patch.recurrenceRule !== null) {
      return { ok: false, status: 400, error: "Invalid recurrence rule" };
    }
  }

  const updates: Prisma.TaskUncheckedUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, status: 400, error: "title is empty" };
    updates.title = title;
  }
  if (patch.description !== undefined) {
    updates.description =
      sanitizeTaskDescriptionForStorage(patch.description) ?? null;
  }
  if (patch.dueDate !== undefined) updates.dueDate = patch.dueDate;
  const nextDeadline = deadlineForPatch(task, patch);
  if (nextDeadline !== undefined) updates.deadline = nextDeadline;
  if (patch.estimatedMinutes !== undefined) {
    updates.estimatedMinutes = patch.estimatedMinutes;
    updates.duration = patch.estimatedMinutes;
  }
  if (patch.noPriority) updates.priority = "none";
  else if (patch.priorityLevel) {
    updates.priorityLevel = patch.priorityLevel;
    // Picking a real priority ends "No priority".
    updates.priority = null;
  }
  if (repeat !== undefined) {
    updates.recurrenceRule = repeat;
    updates.isRecurring = repeat !== null;
  }
  if (patch.tagIds) {
    updates.tags = { set: patch.tagIds.map((id) => ({ id })) };
  }
  if (patch.scheduleId !== undefined) updates.scheduleId = patch.scheduleId;
  if (patch.energyRequired) updates.energyRequired = patch.energyRequired;
  if (projectId !== undefined) updates.projectId = projectId;
  if (patch.entry !== undefined) updates.entry = patch.entry?.trim() || null;
  if (patch.fullTime !== undefined) updates.fullTime = patch.fullTime;
  if (patch.dependsOnId !== undefined) {
    if (patch.dependsOnId) {
      const blocker = await checkBlocker(
        { userId, workspace },
        patch.dependsOnId,
        taskId
      );
      if (!blocker.ok) return blocker;
    }
    updates.dependsOnId = patch.dependsOnId;
  }

  if (patch.goalId !== undefined) {
    if (
      patch.goalId &&
      !(await prisma.goal.findFirst({
        where: { id: patch.goalId, workspaceId, archivedAt: null },
        select: { id: true },
      }))
    ) {
      return { ok: false, status: 400, error: "Goal not found" };
    }
    updates.goalId = patch.goalId;
  }

  if (patch.originPageId !== undefined) {
    if (
      patch.originPageId &&
      !(await getPage({ userId, workspace }, patch.originPageId))
    ) {
      return { ok: false, status: 400, error: "Origin page not found" };
    }
    updates.originKind = patch.originPageId ? DOC_ORIGIN : null;
    updates.originId = patch.originPageId || null;
  }

  const placement = await planPlacement({
    userId,
    schedulingUserId: task.assigneeId,
    task,
    placement: patch,
    estimatedMinutes: patch.estimatedMinutes,
  });
  if (placement && !placement.ok) return placement;
  if (placement) {
    const { dueDate, ...placed } = placement.data;
    Object.assign(updates, placed);
    // The placed day becomes the due day, as in the app; an explicit dueDate
    // in the same write wins and the deadline is left alone.
    if (dueDate && patch.dueDate === undefined) updates.dueDate = dueDate;
  }

  const wasCompleted = task.status === TaskStatus.COMPLETED;
  const completing = patch.status === TaskStatus.COMPLETED && !wasCompleted;
  if (patch.status && patch.status !== task.status) {
    updates.status = patch.status;
    updates.completedAt = completing ? newDate() : null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, task, changed: false };
  }

  let recurringCompletion: RecurringCompletion | null = null;
  let alreadyDone: RecurringAlreadyDone | undefined;
  if (completing && task.isRecurring && task.recurrenceRule) {
    const plan = planRecurringCompletion(task, newDate());
    if (plan.duplicate) {
      // Already ticked today and the next occurrence is ahead: leave it, and
      // say so, so the caller does not read the answer as a completion.
      delete updates.status;
      delete updates.completedAt;
      alreadyDone = recurringAlreadyDone(task);
      if (Object.keys(updates).length === 0) {
        return {
          ok: true,
          task,
          changed: false,
          recurringAlreadyDone: alreadyDone,
        };
      }
    } else {
      recurringCompletion = plan.completion;
      if (plan.advance) Object.assign(updates, plan.advance);
    }
  }

  const taskUpdate = {
    where: { id: taskId },
    data: {
      ...updates,
      ...(workspaceId && {
        activities: {
          create: { workspaceId, actorId: userId, action: "UPDATED" },
        },
      }),
    },
  } satisfies Prisma.TaskUpdateArgs;
  let updated: Task;
  if (recurringCompletion) {
    const completion = recurringCompletion;
    updated = await prisma.$transaction(async (transaction) => {
      await upsertRecurringOccurrence(transaction, task, completion, userId);
      return transaction.task.update(taskUpdate);
    });
  } else {
    updated = await prisma.task.update(taskUpdate);
  }

  const mappingProjectId = projectId === undefined ? task.projectId : projectId;
  const mapping = mappingProjectId
    ? await prisma.taskListMapping.findFirst({
        where: { projectId: mappingProjectId },
        select: { id: true },
      })
    : null;
  if (mapping) {
    const tracker = new TaskChangeTracker();
    await tracker.trackChange(
      task.id,
      "UPDATE" as ChangeType,
      userId,
      tracker.compareTaskObjects(task, updated),
      undefined,
      mapping.id
    );
  }

  if (placement?.ok && placement.frozen && task.assigneeId) {
    await writeFrozenPlacement({
      taskId,
      userId: task.assigneeId,
      ...placement.frozen,
    });
  }

  if (task.assigneeId) schedulePushTaskBlock(task.assigneeId, taskId);

  if (completing) {
    await recomputeTaskActuals(updated.id);
    await sendConnectorWebhook({
      userId,
      event: "task.completed",
      payload: { taskId: updated.id, title: updated.title },
    });
    // Done ends the task's running focus; the scheduler run below takes back
    // the minutes saved.
    await endFocusForCompletedTask({ userId, task: updated });
  }

  await scheduleAllTasksForUser(userId, {
    workspaceId:
      workspace.dataScope.mode === "workspace"
        ? workspace.workspaceId
        : undefined,
  });
  logger.info(
    "Task updated through the connector",
    { taskId, fields: Object.keys(updates) },
    LOG_SOURCE
  );

  const fresh = await prisma.task.findFirst({
    where: { id: taskId, ...scope },
    include: { scheduledBlocks: { orderBy: { chunkIndex: "asc" } } },
  });
  rescheduleRemindersSoon({ taskId });
  return {
    ok: true,
    task: fresh ?? updated,
    changed: true,
    ...(alreadyDone && { recurringAlreadyDone: alreadyDone }),
  };
}
