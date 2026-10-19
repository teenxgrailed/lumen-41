import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

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
  const tasks = await prisma.task.findMany({
    where: {
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      isArchived: false,
    },
  });
  await sendConnectorWebhook({
    userId: auth.userId,
    event: "schedule.changed",
    payload: { taskCount: tasks.length },
  });

  await publishRealtimeEventSafe(auth.userId, "tasks-updated");
  return NextResponse.json({ tasks });
}
