import { NextRequest, NextResponse } from "next/server";

import {
  getQuitSummary,
  quitGate,
  quitGateResponse,
} from "@/services/habits/quit-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "HabitQuitSummaryAPI";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/habits/:id/quit-summary: current and best streak, clean days, the
 * next milestone and the urge pattern by hour and weekday in the person's time
 * zone. Pro, behind `habits_quit`.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const refusal = await quitGate(auth.userId);
  if (refusal) return quitGateResponse(refusal);
  const { id } = await params;
  const summary = await getQuitSummary({
    userId: auth.userId,
    workspace: auth.workspace!,
    habitId: id,
  });
  if (!summary) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }
  return NextResponse.json({ summary });
}
