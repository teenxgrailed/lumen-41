import { NextRequest, NextResponse } from "next/server";

import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { findTaskProjectMoveConflict } from "@/services/tasks/dependencies";
import { partsWaitsInclude } from "@/services/tasks/parts-waits";
import {
  type RecurringCompletion,
  planRecurringCompletion,
  upsertRecurringOccurrence,
} from "@/services/tasks/recurring-completion";
import { deleteTaskForever } from "@/services/tasks/trash";
import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import {
  type Prisma,
  type Task,
  TaskBusyStatus,
  WorkspaceRole,
} from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { isTaskPlacementBlocked } from "@/lib/flexible-hours-guard-server";
import { logger } from "@/lib/logger";
import { parseV3Fields, taskV3FieldsSchema } from "@/lib/needt3/api-fields";
import { expandOriginPage, withOriginPageId } from "@/lib/needt3/origin-page";
import { originPageRefusal } from "@/lib/needt3/origin-page-access";
import { prisma } from "@/lib/prisma";
import {
  claimOfflineMutation,
  completeOfflineMutation,
  failOfflineMutation,
  offlineRevisionConflict,
  replayOfflineMutation,
} from "@/lib/pwa/offline-mutation";
import {
  deleteTaskBlockEvent,
  schedulePushTaskBlock,
} from "@/lib/task-block-push";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";
import {
  ChangeType,
  TaskChangeTracker,
} from "@/lib/task-sync/task-change-tracker";
import { normalizeRecurrenceRule } from "@/lib/utils/normalize-recurrence-rules";

import { TaskStatus } from "@/types/task";

const LOG_SOURCE = "task-route";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: {
        id,
        ...workspaceDataScopeWhere(auth.workspace, userId),
      },
      include: {
        tags: true,
        project: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
        ...partsWaitsInclude,
        activities: {
          include: { actor: { select: { id: true, name: true, image: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    return NextResponse.json(withOriginPageId(task));
  } catch (error) {
    logger.error(
      "Error fetching task:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let offlineRecordId: string | null = null;
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    logger.info(`Updating task ${id}`, { userId }, LOG_SOURCE);

    const task = await prisma.task.findUnique({
      where: {
        id,
        ...workspaceDataScopeWhere(auth.workspace, userId),
      },
      include: {
        tags: true,
        project: { select: { status: true } },
      },
    });

    if (!task) {
      logger.warn(`Task not found: ${id}`, { userId }, LOG_SOURCE);
      return new NextResponse("Task not found", { status: 404 });
    }
    const offlineOperation = `UPDATE_TASK:${auth.workspace?.workspaceId}:${id}`;
    const replay = await replayOfflineMutation({
      request,
      userId,
      operation: offlineOperation,
    });
    if (replay) return replay;
    const revisionConflict = offlineRevisionConflict(request, task.updatedAt);
    if (revisionConflict) return revisionConflict;

    if (task.project?.status === "archived") {
      return NextResponse.json({ error: "PROJECT_ARCHIVED" }, { status: 409 });
    }

    const json = await request.json();
    logger.info(`Update payload for task ${id}`, { payload: json }, LOG_SOURCE);

    if (
      task.isArchived &&
      (json.isArchived !== false ||
        Object.keys(json).some((key) => key !== "isArchived"))
    ) {
      return new NextResponse(
        "Archived tasks are read-only. Restore the task before editing it.",
        { status: 409 }
      );
    }

    const {
      tagIds,
      projectId,
      scheduleId,
      bypassBlockedHours,
      assigneeId: requestedAssigneeId,
      ...updates
    } = json;
    delete updates.project;
    delete updates.userId;
    delete updates.workspaceId;
    delete updates.assignee;
    delete updates.activities;
    // GET now includes these; a client echoing the task back must not write
    // them through the task (they have their own routes).
    delete updates.parts;
    delete updates.waits;
    delete updates.archivedAt;
    delete updates.recurrenceMasterId;
    delete updates.recurrenceInstanceAt;
    const v3 = parseV3Fields(taskV3FieldsSchema, updates);
    if (!v3.ok) return new NextResponse(v3.error, { status: 400 });
    Object.assign(updates, expandOriginPage(v3.data));
    delete updates.originPageId;
    if (v3.data.originPageId) {
      const refusal = await originPageRefusal(auth, v3.data.originPageId);
      if (refusal) return refusal;
    }
    const workspaceId = task.workspaceId ?? auth.workspace?.workspaceId;
    if (
      requestedAssigneeId !== undefined &&
      requestedAssigneeId !== null &&
      (typeof requestedAssigneeId !== "string" ||
        !workspaceId ||
        (requestedAssigneeId !== userId &&
          !(await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId,
                userId: requestedAssigneeId,
              },
            },
            select: { id: true },
          }))))
    ) {
      return new NextResponse("Invalid workspace assignee", { status: 400 });
    }
    if (
      updates.busyStatus !== undefined &&
      !Object.values(TaskBusyStatus).includes(updates.busyStatus)
    ) {
      return new NextResponse("Invalid busy status", { status: 400 });
    }
    if (
      updates.stageId !== undefined &&
      updates.stageId !== null &&
      typeof updates.stageId !== "string"
    ) {
      return new NextResponse("Invalid stage", { status: 400 });
    }
    if (
      projectId &&
      (!workspaceId ||
        !(await prisma.project.findFirst({
          where: { id: projectId, workspaceId, status: "active" },
          select: { id: true },
        })))
    ) {
      return new NextResponse("Invalid workspace project", { status: 400 });
    }
    const targetProjectId =
      projectId === undefined ? task.projectId : projectId;
    if (projectId !== undefined && targetProjectId !== task.projectId) {
      const conflict = await findTaskProjectMoveConflict({
        userId,
        workspace: auth.workspace,
        taskId: id,
        targetProjectId,
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: "PROJECT_DEPENDENCY_CONFLICT",
            message: `Cannot move task while it is linked to “${conflict.task.title}”. Remove that dependency first.`,
            conflict,
          },
          { status: 409 }
        );
      }
    }
    const effectiveAssigneeId =
      requestedAssigneeId !== undefined ? requestedAssigneeId : task.assigneeId;
    const assigneeChanged =
      requestedAssigneeId !== undefined &&
      requestedAssigneeId !== task.assigneeId;
    if (assigneeChanged && !updates.scheduledStart && !updates.scheduledEnd) {
      updates.scheduledStart = null;
      updates.scheduledEnd = null;
      updates.scheduleLocked = false;
      updates.scheduleScore = null;
    }
    if (
      effectiveAssigneeId === null &&
      (updates.scheduledStart || updates.scheduledEnd)
    ) {
      return new NextResponse("Assign the task before scheduling it", {
        status: 400,
      });
    }
    const schedulingUserId = effectiveAssigneeId ?? userId;
    if (
      updates.isArchived !== undefined &&
      typeof updates.isArchived !== "boolean"
    ) {
      return new NextResponse("Invalid archive state", { status: 400 });
    }
    const archiveStateChanged =
      typeof updates.isArchived === "boolean" &&
      updates.isArchived !== task.isArchived;
    if (archiveStateChanged) {
      updates.archivedAt = updates.isArchived ? newDate() : null;
      if (updates.isArchived) {
        updates.scheduledStart = null;
        updates.scheduledEnd = null;
        updates.scheduleLocked = false;
      }
    }
    if (scheduleId) {
      const schedule = await prisma.workSchedule.findFirst({
        where: { id: scheduleId, userId: schedulingUserId },
        select: { id: true },
      });
      if (!schedule) {
        return new NextResponse("Invalid work schedule", { status: 400 });
      }
    }
    if ("description" in updates) {
      updates.description =
        sanitizeTaskDescriptionForStorage(updates.description) ?? null;
    }

    if (!bypassBlockedHours && updates.scheduledStart && updates.scheduledEnd) {
      const blocked = await isTaskPlacementBlocked(
        schedulingUserId,
        newDate(updates.scheduledStart),
        newDate(updates.scheduledEnd)
      );
      if (blocked) {
        return new NextResponse("This time is blocked out", { status: 400 });
      }
    }

    // Set completedAt when task is marked as completed
    if (
      updates.status === TaskStatus.COMPLETED &&
      task.status !== TaskStatus.COMPLETED
    ) {
      updates.completedAt = newDate();
    }

    let recurringCompletion: RecurringCompletion | null = null;

    // Completing the series row records an immutable occurrence snapshot and
    // advances only the future-facing master row.
    if (
      task.isRecurring &&
      updates.status === TaskStatus.COMPLETED &&
      task.recurrenceRule
    ) {
      try {
        const plan = planRecurringCompletion(
          task,
          updates.completedAt ?? newDate()
        );
        recurringCompletion = plan.completion;
        if (plan.advance) Object.assign(updates, plan.advance);
      } catch (error) {
        logger.error(
          "Error handling task completion:",
          {
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        return new NextResponse("Error handling task completion", {
          status: 500,
        });
      }
    }

    // Normalize recurrence rule if it exists in updates
    if (updates.recurrenceRule) {
      updates.recurrenceRule = normalizeRecurrenceRule(updates.recurrenceRule);
    }

    // Find the project's task mapping if it exists
    let mappingId = null;
    const mappingProjectId =
      projectId === undefined ? task.projectId : projectId;

    if (mappingProjectId) {
      const mapping = await prisma.taskListMapping.findFirst({
        where: {
          projectId: mappingProjectId,
        },
      });
      if (mapping) {
        mappingId = mapping.id;
      }
    }

    // Save the old task for change tracking
    const oldTask = { ...task };

    const claim = await claimOfflineMutation({
      request,
      userId,
      operation: offlineOperation,
    });
    if (claim.response) return claim.response;
    offlineRecordId = claim.recordId;

    const taskUpdate: Prisma.TaskUpdateArgs = {
      where: {
        id: id,
        ...workspaceDataScopeWhere(auth.workspace, userId),
      },
      data: {
        ...updates,
        ...(requestedAssigneeId !== undefined && {
          assigneeId: requestedAssigneeId,
        }),
        ...(assigneeChanged && {
          blockEventId: null,
          blockFeedId: null,
          blockDirty: false,
          ...(scheduleId === undefined && { scheduleId: null }),
        }),
        ...(scheduleId !== undefined && { scheduleId: scheduleId || null }),
        ...(tagIds && {
          tags: {
            set: [], // First disconnect all tags
            connect: tagIds.map((id: string) => ({ id })), // Then connect new ones
          },
        }),
        project:
          projectId === null
            ? { disconnect: true }
            : projectId
              ? { connect: { id: projectId } }
              : undefined,
        ...(workspaceId && {
          activities: {
            create: {
              workspaceId,
              actorId: userId,
              action: "UPDATED",
            },
          },
        }),
      },
      include: {
        tags: true,
        project: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
      },
    };

    let updatedTask;
    if (recurringCompletion) {
      const completion = recurringCompletion;
      updatedTask = await prisma.$transaction(async (transaction) => {
        await upsertRecurringOccurrence(transaction, task, completion, userId);
        return transaction.task.update(taskUpdate);
      });
    } else {
      updatedTask = await prisma.task.update(taskUpdate);
    }

    if (assigneeChanged) {
      if (task.blockEventId && task.blockFeedId) {
        await deleteTaskBlockEvent(
          task.assigneeId ?? userId,
          task.blockEventId,
          task.blockFeedId
        );
      }
      await prisma.scheduledBlock.deleteMany({ where: { taskId: id } });
    }

    if (archiveStateChanged && updates.isArchived) {
      await prisma.scheduledBlock.deleteMany({
        where: { taskId: id, userId: schedulingUserId },
      });
    }

    // A manually placed task is represented by one frozen block. Keeping the
    // block relation in sync here makes Calendar, Space, Focus, and connector
    // reads all observe the same placement without a second storage model.
    if (
      updates.scheduleLocked === true &&
      updates.scheduledStart &&
      updates.scheduledEnd
    ) {
      await prisma.$transaction([
        prisma.scheduledBlock.deleteMany({ where: { taskId: id } }),
        prisma.scheduledBlock.create({
          data: {
            taskId: id,
            userId: schedulingUserId,
            start: newDate(updates.scheduledStart),
            end: newDate(updates.scheduledEnd),
            chunkIndex: 0,
            chunkCount: 1,
            isFrozen: true,
          },
        }),
      ]);

      updatedTask =
        (await prisma.task.findUnique({
          where: {
            id,
            ...workspaceDataScopeWhere(auth.workspace, userId),
          },
          include: {
            tags: true,
            project: true,
            scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
          },
        })) ?? updatedTask;
    }

    // Track the update for sync purposes if the task is in a mapped project
    if (mappingId) {
      const changeTracker = new TaskChangeTracker();
      const changes = changeTracker.compareTaskObjects(
        oldTask,
        updatedTask as Partial<Task>
      );

      await changeTracker.trackChange(
        task.id,
        "UPDATE" as ChangeType,
        userId,
        changes,
        undefined, // providerId will be set during sync
        mappingId
      );

      logger.info(
        `Tracked UPDATE change for task ${task.id} in mapping ${mappingId}`,
        {
          taskId: task.id,
          mappingId,
          changes: Object.keys(changes),
        },
        LOG_SOURCE
      );
    }

    // Schedule calendar block push for any changes to scheduled times or status
    if (effectiveAssigneeId !== null) {
      schedulePushTaskBlock(schedulingUserId, id);
    }

    if (
      updates.status === TaskStatus.COMPLETED &&
      task.status !== TaskStatus.COMPLETED
    ) {
      await recomputeTaskActuals(updatedTask.id);
      await sendConnectorWebhook({
        userId,
        event: "task.completed",
        payload: { taskId: updatedTask.id, title: updatedTask.title },
      });
    }

    await completeOfflineMutation(offlineRecordId);
    return NextResponse.json(withOriginPageId(updatedTask));
  } catch (error) {
    await failOfflineMutation(offlineRecordId);
    logger.error(
      "Error updating task:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let offlineRecordId: string | null = null;
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;

    // `?permanent=true` deletes a task that is already in Trash for good.
    if (request.nextUrl.searchParams.get("permanent") === "true") {
      const outcome = await deleteTaskForever(
        id,
        workspaceDataScopeWhere(auth.workspace, userId)
      );
      if (outcome === "not-found")
        return new NextResponse("Task not found", { status: 404 });
      if (outcome === "not-trashed")
        return NextResponse.json(
          { error: "Only a task in Trash can be deleted for good" },
          { status: 409 }
        );
      return new NextResponse(null, { status: 204 });
    }

    const task = await prisma.task.findUnique({
      where: {
        id,
        ...workspaceDataScopeWhere(auth.workspace, userId),
      },
      include: {
        project: true,
      },
    });

    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }
    const offlineOperation = `ARCHIVE_TASK:${auth.workspace?.workspaceId}:${id}`;
    const replay = await replayOfflineMutation({
      request,
      userId,
      operation: offlineOperation,
    });
    if (replay) return replay;
    const revisionConflict = offlineRevisionConflict(request, task.updatedAt);
    if (revisionConflict) return revisionConflict;

    if (task.project?.status === "archived") {
      return NextResponse.json({ error: "PROJECT_ARCHIVED" }, { status: 409 });
    }

    const claim = await claimOfflineMutation({
      request,
      userId,
      operation: offlineOperation,
    });
    if (claim.response) return claim.response;
    offlineRecordId = claim.recordId;

    if (!task.isArchived) {
      const schedulingUserId = task.assigneeId ?? userId;
      await prisma.task.update({
        where: {
          id,
          ...workspaceDataScopeWhere(auth.workspace, userId),
        },
        data: {
          isArchived: true,
          archivedAt: newDate(),
          scheduledStart: null,
          scheduledEnd: null,
          scheduleLocked: false,
          ...(task.workspaceId && {
            activities: {
              create: {
                workspaceId: task.workspaceId,
                actorId: userId,
                action: "ARCHIVED",
              },
            },
          }),
        },
      });
      await prisma.scheduledBlock.deleteMany({
        where: { taskId: id, userId: schedulingUserId },
      });
      schedulePushTaskBlock(schedulingUserId, id);
    }

    await completeOfflineMutation(offlineRecordId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    await failOfflineMutation(offlineRecordId);
    logger.error(
      "Error deleting task:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
