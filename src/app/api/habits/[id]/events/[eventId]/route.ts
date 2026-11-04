import { NextRequest, NextResponse } from "next/server";

import {
  quitGate,
  quitGateResponse,
  updateHabitEvent,
} from "@/services/habits/quit-service";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { habitEventPatchSchema } from "@/lib/habits";

const LOG_SOURCE = "HabitEventAPI";
type RouteContext = { params: Promise<{ id: string; eventId: string }> };

/**
 * PATCH /api/habits/:id/events/:eventId: write tag, intensity or note onto an
 * event already logged (an urge is created on press, described later). The
 * type and time are immutable. Owner only; Pro, behind `habits_quit`.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const refusal = await quitGate(auth.userId);
  if (refusal) return quitGateResponse(refusal);
  const { id, eventId } = await params;
  const parsed = habitEventPatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  const event = await updateHabitEvent({
    userId: auth.userId,
    workspace: auth.workspace!,
    habitId: id,
    eventId,
    patch: parsed.data,
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ event });
}
