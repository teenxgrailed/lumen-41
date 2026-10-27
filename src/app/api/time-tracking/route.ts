import { NextRequest, NextResponse } from "next/server";

import {
  addManualTimeEntry,
  getTaskTimeSummary,
  startTaskTimer,
  stopTaskTimer,
} from "@/services/time-tracking/timeEntries";
import { TimeEntrySource, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "time-tracking-route";

async function assertTask(
  taskId: string,
  userId: string,
  workspace?: WorkspaceAccess
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...workspaceDataScopeWhere(workspace, userId) },
    select: { id: true },
  });
  return Boolean(task);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId || !(await assertTask(taskId, auth.userId, auth.workspace))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(await getTaskTimeSummary(taskId, auth.userId));
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) ?? {};
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (!taskId || !(await assertTask(taskId, auth.userId, auth.workspace))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (action === "start") {
    const source =
      body.source === TimeEntrySource.focus
        ? TimeEntrySource.focus
        : TimeEntrySource.timer;
    const entry = await startTaskTimer(taskId, auth.userId, source);
    return NextResponse.json({ entry });
  }

  if (action === "pause" || action === "stop") {
    const entry = await stopTaskTimer(taskId, auth.userId);
    const summary = await getTaskTimeSummary(taskId, auth.userId);
    return NextResponse.json({ entry, ...summary });
  }

  if (action === "manual") {
    const minutes = Math.max(1, Math.round(Number(body.minutes) || 0));
    const entry = await addManualTimeEntry(taskId, auth.userId, minutes);
    const summary = await getTaskTimeSummary(taskId, auth.userId);
    return NextResponse.json({ entry, ...summary });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
