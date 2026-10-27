import { NextRequest, NextResponse } from "next/server";

import { TaskReminderKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { canAddTaskReminder } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-reminders-route";
type RouteContext = { params: Promise<{ id: string }> };
const VALID_KINDS = new Set(Object.values(TaskReminderKind));

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const reminders = await prisma.taskReminder.findMany({
    where: { userId: auth.userId, taskId: id, canceledAt: null },
    orderBy: [{ kind: "asc" }, { offsetMinutes: "asc" }],
  });
  return NextResponse.json({ reminders });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    kind?: unknown;
    offsetMinutes?: unknown;
    channels?: unknown;
  };
  if (
    typeof body.kind !== "string" ||
    !VALID_KINDS.has(body.kind as TaskReminderKind) ||
    typeof body.offsetMinutes !== "number" ||
    !Number.isInteger(body.offsetMinutes) ||
    body.offsetMinutes < 0 ||
    body.offsetMinutes > 43_200
  ) {
    return NextResponse.json({ error: "Invalid reminder" }, { status: 400 });
  }
  const task = await prisma.task.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true },
  });
  if (!task)
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const existing = await prisma.taskReminder.findUnique({
    where: {
      taskId_kind_offsetMinutes: {
        taskId: id,
        kind: body.kind as TaskReminderKind,
        offsetMinutes: body.offsetMinutes,
      },
    },
  });
  if (!existing) {
    const entitlement = await canAddTaskReminder(auth.userId, id);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: "UPGRADE_REQUIRED", entitlement },
        { status: 403 }
      );
    }
  }
  const channels = Array.isArray(body.channels)
    ? body.channels.filter(
        (channel): channel is string =>
          channel === "push" || channel === "email"
      )
    : ["push", "email"];
  const reminder = await prisma.taskReminder.upsert({
    where: {
      taskId_kind_offsetMinutes: {
        taskId: id,
        kind: body.kind as TaskReminderKind,
        offsetMinutes: body.offsetMinutes,
      },
    },
    update: {
      channels,
      canceledAt: null,
      deliveryStatus: "PENDING",
      deliveredAt: null,
      lastError: null,
    },
    create: {
      userId: auth.userId,
      taskId: id,
      kind: body.kind as TaskReminderKind,
      offsetMinutes: body.offsetMinutes,
      channels,
    },
  });
  return NextResponse.json({ reminder }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const reminderId = request.nextUrl.searchParams.get("reminderId");
  if (!reminderId) {
    return NextResponse.json(
      { error: "reminderId is required" },
      { status: 400 }
    );
  }
  await prisma.taskReminder.updateMany({
    where: { id: reminderId, userId: auth.userId },
    data: { canceledAt: newDate() },
  });
  return new NextResponse(null, { status: 204 });
}
