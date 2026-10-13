import { NextRequest, NextResponse } from "next/server";

import { partsWaitsInclude } from "@/services/tasks/parts-waits";
import { TaskBusyStatus, WorkspaceRole } from "@prisma/client";
import { RRule } from "rrule";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { isTaskPlacementBlocked } from "@/lib/flexible-hours-guard-server";
import { logger } from "@/lib/logger";
import { parseV3Fields, taskV3FieldsSchema } from "@/lib/needt3/api-fields";
import { prisma } from "@/lib/prisma";
import { activeProjectTaskWhere } from "@/lib/projects/archive";
import { schedulePushTaskBlock } from "@/lib/task-block-push";
import { defaultTaskReminderRows } from "@/lib/task-default-reminders";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";
import {
  ChangeType,
  TaskChangeTracker,
} from "@/lib/task-sync/task-change-tracker";
import { normalizeRecurrenceRule } from "@/lib/utils/normalize-recurrence-rules";

import { EnergyLevel, TaskStatus, TimePreference } from "@/types/task";

const LOG_SOURCE = "tasks-route";

async function isWorkspaceAssignee(workspaceId: string, assigneeId: string) {
  return Boolean(
    await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
      select: { id: true },
    })
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.getAll("status") as TaskStatus[];
    const tagIds = searchParams.getAll("tagIds");
    const energyLevel = searchParams.getAll("energyLevel") as EnergyLevel[];
    const timePreference = searchParams.getAll(
      "timePreference"
    ) as TimePreference[];
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const taskStartDate = searchParams.get("taskStartDate");
    const hideUpcomingTasks = searchParams.get("hideUpcomingTasks") === "true";
    const archived = searchParams.get("archived") === "true";

    const now = newDate();
    const tasks = await prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(auth.workspace, userId),
        isArchived: archived,
        ...(!archived && { AND: [activeProjectTaskWhere] }),
        ...(status.length > 0 && { status: { in: status } }),
        ...(energyLevel.length > 0 && { energyLevel: { in: energyLevel } }),
        ...(timePreference.length > 0 && {
          preferredTime: { in: timePreference },
        }),
        ...(tagIds.length > 0 && { tags: { some: { id: { in: tagIds } } } }),
        ...(search && {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
          ],
        }),
        ...(startDate &&
          endDate && {
            dueDate: {
              gte: newDate(startDate),
              lte: newDate(endDate),
            },
          }),
        ...(taskStartDate && {
          startDate: {
            gte: newDate(taskStartDate),
          },
        }),
        ...(hideUpcomingTasks && {
          OR: [{ startDate: null }, { startDate: { lte: now } }],
        }),
      },
      include: {
        tags: true,
        project: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
        ...partsWaitsInclude,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    logger.error(
      "Error fetching tasks:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const json = await request.json();
    const {
      tagIds,
      recurrenceRule,
      scheduleId,
      assigneeId: requestedAssigneeId,
      ...taskData
    } = json;
    delete taskData.workspaceId;
    delete taskData.userId;
    delete taskData.assignee;
    delete taskData.activities;
    delete taskData.recurrenceMasterId;
    delete taskData.recurrenceInstanceAt;
    const v3 = parseV3Fields(taskV3FieldsSchema, taskData);
    if (!v3.ok) return new NextResponse(v3.error, { status: 400 });
    Object.assign(taskData, v3.data);
    const workspaceId = auth.workspace?.workspaceId;
    const assigneeId =
      requestedAssigneeId === undefined ? userId : requestedAssigneeId;
    if (
      assigneeId !== null &&
      (typeof assigneeId !== "string" ||
        !workspaceId ||
        (assigneeId !== userId &&
          !(await isWorkspaceAssignee(workspaceId, assigneeId))))
    ) {
      return new NextResponse("Invalid workspace assignee", { status: 400 });
    }
    if (
      taskData.busyStatus !== undefined &&
      !Object.values(TaskBusyStatus).includes(taskData.busyStatus)
    ) {
      return new NextResponse("Invalid busy status", { status: 400 });
    }
    if (
      taskData.stageId !== undefined &&
      taskData.stageId !== null &&
      typeof taskData.stageId !== "string"
    ) {
      return new NextResponse("Invalid stage", { status: 400 });
    }
    if (
      taskData.projectId &&
      (!workspaceId ||
        !(await prisma.project.findFirst({
          where: { id: taskData.projectId, workspaceId, status: "active" },
          select: { id: true },
        })))
    ) {
      return new NextResponse("Invalid workspace project", { status: 400 });
    }
    if (
      assigneeId === null &&
      (taskData.scheduledStart || taskData.scheduledEnd)
    ) {
      return new NextResponse("Assign the task before scheduling it", {
        status: 400,
      });
    }
    const description = sanitizeTaskDescriptionForStorage(taskData.description);
    const schedulingUserId = assigneeId ?? userId;
    if (scheduleId) {
      const schedule = await prisma.workSchedule.findFirst({
        where: { id: scheduleId, userId: schedulingUserId },
        select: { id: true },
      });
      if (!schedule) {
        return new NextResponse("Invalid work schedule", { status: 400 });
      }
    }

    if (taskData.scheduledStart && taskData.scheduledEnd) {
      const blocked = await isTaskPlacementBlocked(
        schedulingUserId,
        newDate(taskData.scheduledStart),
        newDate(taskData.scheduledEnd)
      );
      if (blocked) {
        return new NextResponse("This time is blocked out", { status: 400 });
      }
    }

    // Normalize and validate recurrence rule if provided
    const standardizedRecurrenceRule = recurrenceRule
      ? normalizeRecurrenceRule(recurrenceRule)
      : undefined;

    if (standardizedRecurrenceRule) {
      try {
        // Attempt to parse the standardized RRule string to validate it
        RRule.fromString(standardizedRecurrenceRule);
      } catch (error) {
        logger.error(
          "Error parsing recurrence rule:",
          {
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        return new NextResponse("Invalid recurrence rule", { status: 400 });
      }
    }

    // Find the project's task mapping if it exists
    let mappingId = null;
    if (taskData.projectId) {
      const mapping = await prisma.taskListMapping.findFirst({
        where: {
          projectId: taskData.projectId,
        },
      });
      if (mapping) {
        mappingId = mapping.id;
      }
    }

    const task = await prisma.task.create({
      data: {
        ...taskData,
        description,
        // Associate the task with the current user
        userId,
        ...(workspaceId && { workspaceId }),
        assigneeId,
        scheduleId: scheduleId || null,
        isRecurring: !!recurrenceRule,
        recurrenceRule: standardizedRecurrenceRule,
        ...(tagIds && {
          tags: {
            connect: tagIds.map((id: string) => ({ id })),
          },
        }),
        ...(workspaceId && {
          activities: {
            create: {
              workspaceId,
              actorId: userId,
              action: "CREATED",
            },
          },
        }),
      },
      include: {
        tags: true,
        project: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
      },
    });

    const plan = await getPlan(userId);
    await prisma.taskReminder.createMany({
      data: defaultTaskReminderRows(plan, task, schedulingUserId),
      skipDuplicates: true,
    });

    // Track the creation for sync purposes if the task is in a mapped project
    if (mappingId) {
      const changeTracker = new TaskChangeTracker();
      await changeTracker.trackChange(
        task.id,
        "CREATE" as ChangeType,
        userId,
        { task },
        undefined, // providerId will be determined later during sync
        mappingId
      );

      logger.info(
        `Tracked CREATE change for task ${task.id} in mapping ${mappingId}`,
        {
          taskId: task.id,
          mappingId,
        },
        LOG_SOURCE
      );
    }

    // Schedule calendar block push if task has scheduled times
    if (task.scheduledStart && task.scheduledEnd) {
      schedulePushTaskBlock(schedulingUserId, task.id);
    }

    return NextResponse.json(task);
  } catch (error) {
    logger.error(
      "Error creating task:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
