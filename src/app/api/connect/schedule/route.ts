import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

async function readSchedule(userId: string, workspace: WorkspaceAccess) {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      isArchived: false,
      status: { not: "completed" },
      OR: [
        { scheduledEnd: { gte: now } },
        { scheduledEnd: null },
        { scheduledBlocks: { some: { end: { gte: now } } } },
      ],
    },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    include: {
      scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
    },
  });

  return {
    generatedAt: now.toISOString(),
    tasks,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;

  return NextResponse.json(await readSchedule(auth.userId, auth.workspace));
}

export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;

  await scheduleAllTasksForUser(auth.userId, {
    workspaceId:
      auth.workspace.dataScope.mode === "workspace"
        ? auth.workspace.workspaceId
        : undefined,
  });
  await publishRealtimeEventSafe(auth.userId, "tasks-updated");
  return NextResponse.json(await readSchedule(auth.userId, auth.workspace));
}
