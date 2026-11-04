import { NextRequest, NextResponse } from "next/server";

import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  QuitHabitEventError,
  listHabitEvents,
  quitGate,
  quitGateResponse,
  recordHabitEvent,
} from "@/services/habits/quit-service";
import { HabitEventType, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { habitEventInputSchema } from "@/lib/habits";

const LOG_SOURCE = "HabitEventsAPI";
type RouteContext = { params: Promise<{ id: string }> };

const listQuerySchema = z.object({
  type: z.nativeEnum(HabitEventType).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).optional(),
});

/**
 * GET /api/habits/:id/events: the event log of a QUIT habit, newest first
 * (`type`, `before` and `limit` narrow it; `nextBefore` pages on). Pro, behind
 * `habits_quit`.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const refusal = await quitGate(auth.userId);
  if (refusal) return quitGateResponse(refusal);
  const { id } = await params;
  const query = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!query.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const result = await listHabitEvents({
    userId: auth.userId,
    workspace: auth.workspace!,
    habitId: id,
    ...query.data,
  });
  if (!result) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }
  return NextResponse.json({
    events: result.events,
    nextBefore: result.nextBefore,
    limit: query.data.limit ?? EVENTS_DEFAULT_LIMIT,
  });
}

/**
 * POST /api/habits/:id/events: log an urge, a resisted urge, a relapse or a
 * milestone on a QUIT habit. A relapse restarts the streak. Pro, behind
 * `habits_quit`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const refusal = await quitGate(auth.userId);
  if (refusal) return quitGateResponse(refusal);
  const { id } = await params;
  const parsed = habitEventInputSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  try {
    const event = await recordHabitEvent({
      userId: auth.userId,
      workspace: auth.workspace!,
      habitId: id,
      event: parsed.data,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof QuitHabitEventError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }
}
