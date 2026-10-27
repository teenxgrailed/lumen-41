import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { canCreateHabit } from "@/lib/entitlements";
import { habitInputSchema } from "@/lib/habits";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "HabitsAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const habits = await prisma.habit.findMany({
    where: {
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      userId: auth.userId,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ habits });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const parsed = habitInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid habit" }, { status: 400 });
  const entitlement = await canCreateHabit(auth.userId);
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: "UPGRADE_REQUIRED", entitlement },
      { status: 403 }
    );
  }
  if (parsed.data.scheduleId) {
    const schedule = await prisma.workSchedule.findFirst({
      where: { id: parsed.data.scheduleId, userId: auth.userId },
      select: { id: true },
    });
    if (!schedule)
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
  }
  if (parsed.data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const habit = await prisma.habit.create({
    data: {
      ...parsed.data,
      userId: auth.userId,
      workspaceId: auth.workspace!.workspaceId,
    },
  });
  return NextResponse.json({ habit }, { status: 201 });
}
