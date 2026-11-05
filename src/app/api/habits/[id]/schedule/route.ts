import { NextRequest, NextResponse } from "next/server";

import { materializeHabitWeek } from "@/services/habits/habit-service";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "HabitScheduleAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const result = await materializeHabitWeek(auth.userId, auth.workspace!, id);
  if (!result)
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  return NextResponse.json(result);
}
