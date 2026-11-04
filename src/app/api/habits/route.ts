import { NextRequest, NextResponse } from "next/server";

import { quitGate, quitGateResponse } from "@/services/habits/quit-service";
import { HabitKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { withHabitSlot } from "@/lib/entitlements";
import { habitInputSchema, quitFieldsError } from "@/lib/habits";
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
  // What the client may offer for QUIT habits: the same gate the quit routes use.
  const quit = await quitGate(auth.userId);
  return NextResponse.json({
    habits,
    quit: !quit ? "on" : quit.status === 403 ? "upgrade" : "off",
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const parsed = habitInputSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid habit" }, { status: 400 });
  const now = newDate();
  const quitError = quitFieldsError(parsed.data.kind, parsed.data, now);
  if (quitError)
    return NextResponse.json({ error: quitError }, { status: 400 });
  if (parsed.data.kind === HabitKind.QUIT) {
    // Pro only, behind `habits_quit`; decided here, never by the client.
    const refusal = await quitGate(auth.userId);
    if (refusal) return quitGateResponse(refusal);
    // A quit with no date starts now.
    parsed.data.quitStartedAt ??= now;
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
      where: {
        id: parsed.data.projectId,
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      },
      select: { id: true },
    });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const created = await withHabitSlot(auth.userId, (tx) =>
    tx.habit.create({
      data: {
        ...parsed.data,
        userId: auth.userId,
        workspaceId: auth.workspace!.workspaceId,
      },
    })
  );
  if (!created.allowed) {
    return NextResponse.json(
      { error: "UPGRADE_REQUIRED", entitlement: created.entitlement },
      { status: 403 }
    );
  }
  return NextResponse.json({ habit: created.value }, { status: 201 });
}
