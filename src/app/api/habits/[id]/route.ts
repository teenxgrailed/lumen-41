import { NextRequest, NextResponse } from "next/server";

import { quitGate, quitGateResponse } from "@/services/habits/quit-service";
import { HabitKind, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { withHabitSlot } from "@/lib/entitlements";
import { habitInputSchema, quitFieldsError } from "@/lib/habits";
import { prisma } from "@/lib/prisma";
import { partialWithoutDefaults } from "@/lib/zod-patch";

const LOG_SOURCE = "HabitAPI";
type RouteContext = { params: Promise<{ id: string }> };

/** `{ "archived": false }` restores an archived habit (the undo of DELETE). */
const restoreSchema = z.object({ archived: z.literal(false) }).strict();

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  if (body && typeof body === "object" && "archived" in body) {
    return restoreHabit(id, body, auth);
  }
  const existing = await prisma.habit.findFirst({
    where: {
      id,
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      userId: auth.userId,
      archivedAt: null,
    },
  });
  if (!existing)
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  const parsed = partialWithoutDefaults(habitInputSchema).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid habit" }, { status: 400 });
  // QUIT fields: Pro, behind `habits_quit`. Turning a habit into a quit habit
  // or touching its quit date or reason needs the gate; editing anything else
  // on a quit habit (after a downgrade, say) does not.
  const nextKind = parsed.data.kind ?? existing.kind;
  const quitError = quitFieldsError(nextKind, parsed.data, newDate());
  if (quitError)
    return NextResponse.json({ error: quitError }, { status: 400 });
  const touchesQuit =
    (parsed.data.kind === HabitKind.QUIT && existing.kind !== HabitKind.QUIT) ||
    (nextKind === HabitKind.QUIT &&
      (parsed.data.quitStartedAt !== undefined ||
        parsed.data.reason !== undefined));
  if (
    parsed.data.kind === HabitKind.BUILD &&
    existing.kind === HabitKind.QUIT
  ) {
    return NextResponse.json(
      { error: "A quit habit cannot become a build habit" },
      { status: 400 }
    );
  }
  if (touchesQuit) {
    const refusal = await quitGate(auth.userId);
    if (refusal) return quitGateResponse(refusal);
  }
  if (
    parsed.data.kind === HabitKind.QUIT &&
    existing.kind !== HabitKind.QUIT &&
    !parsed.data.quitStartedAt
  ) {
    parsed.data.quitStartedAt = newDate();
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
  const habit = await prisma.habit.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ habit });
}

type HabitAuth = Exclude<
  Awaited<ReturnType<typeof authenticateRequest>>,
  { response: unknown }
>;

async function restoreHabit(id: string, body: unknown, auth: HabitAuth) {
  if (!restoreSchema.safeParse(body).success) {
    return NextResponse.json({ error: "Invalid habit" }, { status: 400 });
  }
  const archived = await prisma.habit.findFirst({
    where: {
      id,
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      userId: auth.userId,
      archivedAt: { not: null },
    },
    select: { id: true },
  });
  if (!archived)
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  // A restored habit is one more active habit, so Free's limit applies.
  const restored = await withHabitSlot(auth.userId, (tx) =>
    tx.habit.update({
      where: { id },
      data: { archivedAt: null, isActive: true },
    })
  );
  if (!restored.allowed) {
    return NextResponse.json(
      { error: "UPGRADE_REQUIRED", entitlement: restored.entitlement },
      { status: 403 }
    );
  }
  return NextResponse.json({ habit: restored.value });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.habit.findFirst({
    where: {
      id,
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      userId: auth.userId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!existing)
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  await prisma.habit.update({
    where: { id },
    data: { archivedAt: newDate(), isActive: false },
  });
  return new NextResponse(null, { status: 204 });
}
