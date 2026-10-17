import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { getPage } from "@/services/pages/page-service";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import {
  checkBlocker,
  entrySchema,
  normalizeSubtasks,
  partsCreateData,
  subtaskListSchema,
  subtaskSelect,
} from "@/services/tasks/subtasks";
import {
  checkLabelsAndHours,
  parseRepeatRule,
} from "@/services/tasks/task-fields";
import { WorkspaceRole } from "@prisma/client";

import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { DOC_ORIGIN, withOriginPageId } from "@/lib/needt3/origin-page";
import { prisma } from "@/lib/prisma";

import {
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  TaskStatus,
} from "@/types/task";

function isEnergy(value: unknown): value is SchedulingEnergyLevel {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH";
}

function isNoPriority(value: unknown) {
  return value === "NONE";
}

function isPriority(value: unknown): value is SchedulingTaskPriority {
  return (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "URGENT"
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  const { userId, workspace } = auth;
  // `?originPageId=<page id>`: the tasks that came from one page.
  const originPageId = request.nextUrl.searchParams.get("originPageId");

  const tasks = await prisma.task.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      isArchived: false,
      ...(originPageId
        ? { originKind: DOC_ORIGIN, originId: originPageId }
        : {}),
    },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    include: { scheduledBlocks: { orderBy: { chunkIndex: "asc" } } },
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    tasks: tasks.map(withOriginPageId),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const { userId, workspace } = auth;

  const body = await request.json();
  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const subtasks = subtaskListSchema.safeParse(body.subtasks ?? []);
  if (!subtasks.success) {
    return NextResponse.json(
      { error: "subtasks must be up to 30 titles of 1-160 characters" },
      { status: 400 }
    );
  }
  const entry =
    body.entry == null
      ? { success: true as const, data: null }
      : entrySchema.safeParse(body.entry);
  if (!entry.success) {
    return NextResponse.json(
      { error: "entry must be one short step of 1-160 characters" },
      { status: 400 }
    );
  }
  if (body.projectId != null) {
    const project =
      typeof body.projectId === "string"
        ? await prisma.project.findFirst({
            where: {
              id: body.projectId,
              workspaceId: workspace.workspaceId,
              status: "active",
            },
            select: { id: true },
          })
        : null;
    if (!project) {
      return NextResponse.json(
        { error: "projectId is not an active project in this workspace" },
        { status: 400 }
      );
    }
  }
  if (body.originPageId != null) {
    const origin =
      typeof body.originPageId === "string"
        ? await getPage({ userId, workspace }, body.originPageId)
        : null;
    if (!origin) {
      return NextResponse.json(
        { error: "originPageId is not a page in this workspace" },
        { status: 400 }
      );
    }
  }
  if (body.dependsOnId != null) {
    const blocker =
      typeof body.dependsOnId === "string"
        ? await checkBlocker({ userId, workspace }, body.dependsOnId)
        : ({
            ok: false,
            status: 400,
            error: "dependsOnId must be a task id",
          } as const);
    if (!blocker.ok) {
      return NextResponse.json(
        { error: blocker.error },
        { status: blocker.status }
      );
    }
  }

  let recurrenceRule: string | null = null;
  if (body.recurrenceRule != null) {
    recurrenceRule = parseRepeatRule(body.recurrenceRule);
    if (!recurrenceRule) {
      return NextResponse.json(
        { error: "recurrenceRule must be an RRULE such as FREQ=WEEKLY" },
        { status: 400 }
      );
    }
  }
  const labelIds = body.labelIds ?? undefined;
  const scheduleId =
    typeof body.scheduleId === "string" && body.scheduleId
      ? body.scheduleId
      : undefined;
  const checked = await checkLabelsAndHours({
    userId,
    schedulingUserId: userId,
    tagIds: labelIds,
    scheduleId,
  });
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      userId,
      workspaceId: workspace.workspaceId,
      assigneeId: userId,
      title: body.title.trim(),
      description:
        typeof body.description === "string" ? body.description.trim() : null,
      status: TaskStatus.TODO,
      duration: Number.isFinite(Number(body.estimatedMinutes))
        ? Math.round(Number(body.estimatedMinutes))
        : undefined,
      estimatedMinutes: Number.isFinite(Number(body.estimatedMinutes))
        ? Math.round(Number(body.estimatedMinutes))
        : undefined,
      deadline: body.deadline ? new Date(body.deadline) : null,
      dueDate: body.deadline ? new Date(body.deadline) : null,
      priorityLevel: isPriority(body.priorityLevel)
        ? body.priorityLevel
        : "MEDIUM",
      ...(isNoPriority(body.priorityLevel) ? { priority: "none" } : {}),
      scheduleId: scheduleId ?? null,
      ...(Array.isArray(labelIds) && labelIds.length
        ? { tags: { connect: labelIds.map((id: string) => ({ id })) } }
        : {}),
      energyRequired: isEnergy(body.energyRequired)
        ? body.energyRequired
        : "MEDIUM",
      contextTag:
        typeof body.contextTag === "string" ? body.contextTag.trim() : null,
      ...(typeof body.projectId === "string"
        ? { projectId: body.projectId }
        : {}),
      ...(typeof body.dependsOnId === "string"
        ? { dependsOnId: body.dependsOnId }
        : {}),
      ...(typeof body.originPageId === "string"
        ? { originKind: DOC_ORIGIN, originId: body.originPageId }
        : {}),
      entry: entry.data,
      parts: partsCreateData(normalizeSubtasks(subtasks.data)),
      isAutoScheduled: true,
      autoScheduled: true,
      scheduleLocked: false,
      isFrozen: false,
      isRecurring: recurrenceRule !== null,
      recurrenceRule,
      activities: {
        create: {
          workspaceId: workspace.workspaceId,
          actorId: userId,
          action: "CREATED",
        },
      },
    },
  });

  await scheduleAllTasksForUser(userId, {
    workspaceId:
      workspace.dataScope.mode === "workspace"
        ? workspace.workspaceId
        : undefined,
  });

  const scheduledTask = await prisma.task.findFirst({
    where: { id: task.id, ...workspaceDataScopeWhere(workspace, userId) },
    include: {
      scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
      parts: { orderBy: { position: "asc" }, select: subtaskSelect },
    },
  });

  return NextResponse.json(withOriginPageId(scheduledTask || task), {
    status: 201,
  });
}
