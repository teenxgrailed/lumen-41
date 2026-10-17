import { NextRequest, NextResponse } from "next/server";

import { habitTodayKey } from "@/services/habits/habit-service";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { prismaDataSource } from "@/lib/needt/prisma-source";

const LOG_SOURCE = "NeedtTodayAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500, headers: NO_STORE }
    );
  }

  const now = newDate();
  const source = prismaDataSource(auth.userId, auth.workspace, () => now);
  const [tasks, projects, habits] = await Promise.all([
    source.getTasks(),
    source.getProjects(),
    source.getHabits(),
  ]);

  return NextResponse.json(
    {
      workspaceId: auth.workspace.workspaceId,
      now: now.toISOString(),
      // The day each habit strip ends on, in the zone the server counts in
      // (the saved one, else UTC), so a client in another zone decodes the
      // strip onto the same days the write landed on.
      today: await habitTodayKey(auth.userId, now),
      tasks,
      projects,
      habits,
      canEdit: auth.workspace.role !== WorkspaceRole.VIEWER,
    },
    { headers: NO_STORE }
  );
}
