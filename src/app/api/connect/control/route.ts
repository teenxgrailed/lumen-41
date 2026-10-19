import { NextRequest, NextResponse } from "next/server";

import {
  authenticateConnectorRequest,
  authenticateConnectorToken,
} from "@/services/connectors/auth";
import { isConnectorControlAction } from "@/services/connectors/control-actions";
import { createLocalEvent } from "@/services/connectors/local-events";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

import { TaskStatus } from "@/types/task";

function forbidden() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function confirmationRequired(
  action: string,
  target: { type: string; id: string; title: string }
) {
  return NextResponse.json(
    {
      error: `Set confirm: true to archive ${target.type} "${target.title}".`,
      confirmation: { action, target },
    },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  let writer: string | null = null;
  const response = await handleControl(request, (userId) => {
    writer = userId;
  });
  if (response.ok && writer) {
    await publishRealtimeEventSafe(writer, "tasks-updated");
    await publishRealtimeEventSafe(writer, "calendar-updated");
  }
  return response;
}

async function handleControl(
  request: NextRequest,
  markWrite: (userId: string) => void
) {
  const userId = await authenticateConnectorToken(
    request.headers.get("authorization")
  );
  if (!userId) return forbidden();

  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action;
  if (!isConnectorControlAction(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  // The shared check: scope for the role (a read-only grant cannot write)
  // and an OAuth grant's bound workspace.
  const auth = await authenticateConnectorRequest(
    request,
    action === "overview" ? WorkspaceRole.VIEWER : WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  const { workspace } = auth;
  if (action !== "overview") markWrite(userId);
  const scope = workspaceDataScopeWhere(workspace, userId);

  if (action === "overview") {
    const [tasks, projects, calendars, events] = await Promise.all([
      prisma.task.findMany({
        where: { ...scope, isArchived: false },
        orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
      }),
      prisma.project.findMany({
        where: { ...scope, status: { not: "archived" } },
        orderBy: { createdAt: "desc" },
      }),
      workspace.workspaceKind === WorkspaceKind.PERSONAL
        ? prisma.calendarFeed.findMany({
            where: { userId, enabled: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      workspace.workspaceKind === WorkspaceKind.PERSONAL
        ? prisma.calendarEvent.findMany({
            where: {
              archivedAt: null,
              feed: { userId, enabled: true },
            },
            orderBy: { start: "asc" },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      generatedAt: newDate().toISOString(),
      tasks,
      projects,
      calendars,
      events,
    });
  }

  if (action === "create_project") {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const project = await prisma.project.create({
      data: {
        userId,
        workspaceId: workspace.workspaceId,
        name: body.name.trim(),
        description:
          typeof body.description === "string" ? body.description : null,
        color: typeof body.color === "string" ? body.color : null,
        icon: typeof body.icon === "string" ? body.icon : null,
      },
    });
    return NextResponse.json(project, { status: 201 });
  }

  if (action === "update_project") {
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result = await prisma.project.updateMany({
      where: { id: body.id, ...scope },
      data: {
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
        ...(typeof body.description === "string"
          ? { description: body.description }
          : {}),
        ...(typeof body.color === "string" ? { color: body.color } : {}),
      },
    });
    if (!result.count)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(
      await prisma.project.findFirst({ where: { id: body.id, ...scope } })
    );
  }

  if (action === "update_task" || action === "complete_task") {
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (typeof body.projectId === "string") {
      const project = await prisma.project.findFirst({
        where: { id: body.projectId, ...scope },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project not found in the active workspace" },
          { status: 404 }
        );
      }
    }
    const data =
      action === "complete_task"
        ? { status: TaskStatus.COMPLETED, completedAt: newDate() }
        : {
            ...(typeof body.title === "string"
              ? { title: body.title.trim() }
              : {}),
            ...(typeof body.description === "string"
              ? { description: body.description }
              : {}),
            ...(typeof body.status === "string"
              ? { status: body.status as TaskStatus }
              : {}),
            ...(typeof body.projectId === "string" || body.projectId === null
              ? { projectId: body.projectId }
              : {}),
          };
    const result = await prisma.task.updateMany({
      where: { id: body.id, ...scope, isArchived: false },
      data,
    });
    if (!result.count)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    await scheduleAllTasksForUser(userId, {
      workspaceId:
        workspace.dataScope.mode === "workspace"
          ? workspace.workspaceId
          : undefined,
    });
    return NextResponse.json(
      await prisma.task.findFirst({
        where: { id: body.id, ...scope, isArchived: false },
      })
    );
  }

  const calendarAction =
    action === "create_calendar" ||
    action === "create_event" ||
    action === "update_event" ||
    action === "delete_event" ||
    action === "delete_calendar" ||
    action === "restore_event" ||
    action === "restore_calendar";
  if (calendarAction && workspace.workspaceKind !== WorkspaceKind.PERSONAL) {
    return NextResponse.json(
      {
        error:
          "Personal calendar actions are unavailable in shared workspaces.",
      },
      { status: 403 }
    );
  }

  if (action === "create_calendar") {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const calendar = await prisma.calendarFeed.create({
      data: {
        userId,
        name: body.name.trim(),
        type: "LOCAL",
        color: typeof body.color === "string" ? body.color : "#6366F1",
        enabled: true,
      },
    });
    return NextResponse.json(calendar, { status: 201 });
  }

  if (action === "create_event") {
    if (
      typeof body.title !== "string" ||
      typeof body.start !== "string" ||
      typeof body.end !== "string"
    ) {
      return NextResponse.json(
        { error: "title, start, and end are required" },
        { status: 400 }
      );
    }
    const created = await createLocalEvent(userId, {
      title: body.title,
      start: body.start,
      end: body.end,
      allDay: body.allDay === true,
      description:
        typeof body.description === "string" ? body.description : null,
      location: typeof body.location === "string" ? body.location : null,
      feedId: typeof body.feedId === "string" ? body.feedId : undefined,
    });
    if (!created.ok) {
      return NextResponse.json(
        { error: created.error },
        { status: created.status }
      );
    }
    return NextResponse.json(created.event, { status: 201 });
  }

  if (action === "update_event") {
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result = await prisma.calendarEvent.updateMany({
      where: { id: body.id, archivedAt: null, feed: { userId, enabled: true } },
      data: {
        ...(typeof body.title === "string" ? { title: body.title.trim() } : {}),
        ...(typeof body.description === "string"
          ? { description: body.description }
          : {}),
        ...(typeof body.location === "string"
          ? { location: body.location }
          : {}),
        ...(typeof body.start === "string"
          ? { start: newDate(body.start) }
          : {}),
        ...(typeof body.end === "string" ? { end: newDate(body.end) } : {}),
      },
    });
    if (!result.count)
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    return NextResponse.json(
      await prisma.calendarEvent.findFirst({
        where: {
          id: body.id,
          archivedAt: null,
          feed: { userId, enabled: true },
        },
      })
    );
  }

  if (
    action === "delete_task" ||
    action === "delete_project" ||
    action === "delete_event" ||
    action === "delete_calendar"
  ) {
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    const target =
      action === "delete_task"
        ? await prisma.task.findFirst({
            where: { id: body.id, ...scope, isArchived: false },
            select: {
              id: true,
              title: true,
              assigneeId: true,
              workspaceId: true,
            },
          })
        : action === "delete_project"
          ? await prisma.project.findFirst({
              where: { id: body.id, ...scope, status: { not: "archived" } },
              select: { id: true, name: true },
            })
          : action === "delete_event"
            ? await prisma.calendarEvent.findFirst({
                where: { id: body.id, archivedAt: null, feed: { userId } },
                select: { id: true, title: true },
              })
            : await prisma.calendarFeed.findFirst({
                where: { id: body.id, userId, enabled: true },
                select: { id: true, name: true },
              });
    if (!target) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 });
    }
    const confirmationTarget = {
      type:
        action === "delete_task"
          ? "task"
          : action === "delete_project"
            ? "project"
            : action === "delete_event"
              ? "event"
              : "calendar",
      id: target.id,
      title: "title" in target ? target.title : target.name,
    };
    if (body.confirm !== true) {
      return confirmationRequired(action, confirmationTarget);
    }

    if (action === "delete_task") {
      const taskTarget = target as {
        id: string;
        title: string;
        assigneeId: string | null;
        workspaceId: string | null;
      };
      const schedulingUserId = taskTarget.assigneeId ?? userId;
      await prisma.task.update({
        where: { id: taskTarget.id },
        data: {
          isArchived: true,
          archivedAt: newDate(),
          scheduledStart: null,
          scheduledEnd: null,
          scheduleLocked: false,
          ...(taskTarget.workspaceId && {
            activities: {
              create: {
                workspaceId: taskTarget.workspaceId,
                actorId: userId,
                action: "ARCHIVED",
              },
            },
          }),
        },
      });
      await prisma.scheduledBlock.deleteMany({
        where: { taskId: taskTarget.id, userId: schedulingUserId },
      });
      schedulePushTaskBlock(schedulingUserId, taskTarget.id);
    } else if (action === "delete_project") {
      await prisma.project.update({
        where: { id: target.id },
        data: { status: "archived" },
      });
    } else if (action === "delete_event") {
      await prisma.calendarEvent.update({
        where: { id: target.id },
        data: { archivedAt: newDate() },
      });
    } else {
      await prisma.calendarFeed.update({
        where: { id: target.id },
        data: { enabled: false },
      });
    }
    return NextResponse.json({
      deleted: false,
      archived: true,
      target: confirmationTarget,
    });
  }

  if (
    action === "restore_task" ||
    action === "restore_project" ||
    action === "restore_event" ||
    action === "restore_calendar"
  ) {
    if (typeof body.id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result =
      action === "restore_task"
        ? await prisma.task.updateMany({
            where: { id: body.id, ...scope, isArchived: true },
            data: { isArchived: false, archivedAt: null },
          })
        : action === "restore_project"
          ? await prisma.project.updateMany({
              where: { id: body.id, ...scope, status: "archived" },
              data: { status: "active" },
            })
          : action === "restore_event"
            ? await prisma.calendarEvent.updateMany({
                where: {
                  id: body.id,
                  archivedAt: { not: null },
                  feed: { userId },
                },
                data: { archivedAt: null },
              })
            : await prisma.calendarFeed.updateMany({
                where: { id: body.id, userId, enabled: false },
                data: { enabled: true },
              });
    if (!result.count) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 });
    }
    if (action === "restore_task") {
      await scheduleAllTasksForUser(userId, {
        workspaceId:
          workspace.dataScope.mode === "workspace"
            ? workspace.workspaceId
            : undefined,
      });
    }
    return NextResponse.json({ restored: true, id: body.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
