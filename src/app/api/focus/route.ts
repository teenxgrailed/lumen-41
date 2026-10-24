import { NextRequest, NextResponse } from "next/server";

import {
  getWeeklyFocusReport,
  recomputeFocusStats,
  recordFocusSession,
} from "@/services/focus/focusStats";
import {
  FocusTaskNotFoundError,
  focusTaskScope,
} from "@/services/focus/task-scope";
import { FocusSessionMode } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { canViewFocusStats } from "@/lib/entitlements";

const LOG_SOURCE = "focus-route";

function parseMode(value: unknown): FocusSessionMode {
  if (value === FocusSessionMode.FLOW) return FocusSessionMode.FLOW;
  if (value === FocusSessionMode.DEEP_FOCUS) return FocusSessionMode.DEEP_FOCUS;
  return FocusSessionMode.POMODORO;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const entitlement = await canViewFocusStats(auth.userId);
    const stats = await recomputeFocusStats(auth.userId);
    const weeklyReport = await getWeeklyFocusReport(auth.userId);
    return NextResponse.json({
      stats: entitlement.allowed ? stats : { ...stats, focusScore: 0 },
      weeklyReport: entitlement.allowed
        ? weeklyReport
        : { ...weeklyReport, estimateAccuracyPercent: null },
      upgradeRequired: entitlement.upgradeRequired,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load focus report",
      LOG_SOURCE,
      "Could not load focus report."
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const rawElapsed = Number(body.elapsedMinutes);
    if (!Number.isFinite(rawElapsed) || rawElapsed <= 0) {
      return NextResponse.json(
        { error: "elapsedMinutes must be a positive number" },
        { status: 400 }
      );
    }
    const elapsedMinutes = Math.max(1, Math.round(rawElapsed));
    const endedAt = body.endedAt ? newDate(body.endedAt) : newDate();
    const startedAt = body.startedAt
      ? newDate(body.startedAt)
      : newDate(endedAt.getTime() - elapsedMinutes * 60_000);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid focus session dates" },
        { status: 400 }
      );
    }

    // Booking time on a task is a task write: inside the caller's workspace,
    // with an editor seat.
    const taskScope = focusTaskScope(auth.workspace, auth.userId);
    if (typeof body.taskId === "string" && body.taskId && !taskScope) {
      return NextResponse.json(
        { error: "WORKSPACE_ROLE_REQUIRED" },
        { status: 403 }
      );
    }

    const session = await recordFocusSession({
      userId: auth.userId,
      taskId: typeof body.taskId === "string" ? body.taskId : null,
      taskScope,
      mode: parseMode(body.mode),
      plannedMinutes: body.plannedMinutes
        ? Math.round(Number(body.plannedMinutes))
        : null,
      elapsedMinutes,
      completed: Boolean(body.completed),
      abandoned: Boolean(body.abandoned),
      startedAt,
      endedAt,
    });

    const entitlement = await canViewFocusStats(auth.userId);
    if (!entitlement.allowed) {
      return NextResponse.json({
        session,
        stats: null,
        weeklyReport: null,
        upgradeRequired: entitlement.upgradeRequired,
      });
    }
    const stats = await recomputeFocusStats(auth.userId);
    const weeklyReport = await getWeeklyFocusReport(auth.userId);
    return NextResponse.json({
      session,
      stats,
      weeklyReport,
      upgradeRequired: false,
    });
  } catch (error) {
    if (error instanceof FocusTaskNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return routeErrorResponse(
      error,
      "Failed to record focus session",
      LOG_SOURCE,
      "Could not record focus session."
    );
  }
}
