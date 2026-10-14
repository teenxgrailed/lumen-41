import { NextRequest, NextResponse } from "next/server";

import {
  ActiveFocusSessionError,
  FocusExitError,
  extendSession,
  finalizeSession,
  getActiveSession,
  pauseSession,
  requestEarlyExit,
  resumeSession,
  startSession,
} from "@/services/focus/focusSession";
import {
  FocusSessionMode,
  FocusSessionPhase,
  FocusStrictnessMode,
} from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { canUseAdvancedFocusModes } from "@/lib/entitlements";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "focus-session-route";

function parseMode(value: unknown): FocusSessionMode {
  if (value === FocusSessionMode.FLOW) return FocusSessionMode.FLOW;
  if (value === FocusSessionMode.DEEP_FOCUS) return FocusSessionMode.DEEP_FOCUS;
  return FocusSessionMode.POMODORO;
}

// GET /api/focus/session -> the full active session (or { active: false }).
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const session = await getActiveSession(auth.userId);
    return NextResponse.json({ active: Boolean(session), session });
  } catch (error) {
    if (error instanceof ActiveFocusSessionError) {
      return NextResponse.json(
        { error: "ACTIVE_FOCUS_SESSION" },
        { status: 409 }
      );
    }
    return routeErrorResponse(
      error,
      "Failed to load active focus session",
      LOG_SOURCE,
      "Could not load active focus session."
    );
  }
}

// POST /api/focus/session -> lifecycle actions keyed by body.action:
// start | pause | resume | stop. Server owns all timing.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  try {
    switch (action) {
      case "start": {
        const strictness = Object.values(FocusStrictnessMode).includes(
          body.strictness
        )
          ? body.strictness
          : FocusStrictnessMode.NORMAL;
        if (strictness !== FocusStrictnessMode.NORMAL) {
          const entitlement = await canUseAdvancedFocusModes(auth.userId);
          if (!entitlement.allowed) {
            return NextResponse.json(
              { error: "UPGRADE_REQUIRED", plan: entitlement.plan },
              { status: 403 }
            );
          }
        }
        const session = await startSession({
          userId: auth.userId,
          taskId: typeof body.taskId === "string" ? body.taskId : null,
          mode: parseMode(body.mode),
          plannedMinutes:
            body.plannedMinutes == null
              ? null
              : Math.max(1, Math.round(Number(body.plannedMinutes))),
          source: typeof body.source === "string" ? body.source : "web",
          phase: Object.values(FocusSessionPhase).includes(body.phase)
            ? body.phase
            : FocusSessionPhase.FOCUS,
          strictness,
          intention: typeof body.intention === "string" ? body.intention : null,
        });
        return NextResponse.json({ session });
      }
      case "request-stop": {
        const result = await requestEarlyExit(
          auth.userId,
          String(body.sessionId)
        );
        return NextResponse.json(result);
      }
      case "pause": {
        const session = await pauseSession(auth.userId, String(body.sessionId));
        return NextResponse.json({ session });
      }
      case "resume": {
        const session = await resumeSession(
          auth.userId,
          String(body.sessionId)
        );
        return NextResponse.json({ session });
      }
      case "extend": {
        const minutes = Math.max(
          1,
          Math.min(60, Math.round(Number(body.minutes)))
        );
        const session = await extendSession(
          auth.userId,
          String(body.sessionId),
          minutes
        );
        return NextResponse.json({ session });
      }
      case "stop": {
        const session = await finalizeSession({
          userId: auth.userId,
          sessionId: String(body.sessionId),
          completed: Boolean(body.completed),
          markTaskDone: Boolean(body.markTaskDone),
        });
        return NextResponse.json({ session });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    // A start while one is running is a conflict the client words itself.
    if (error instanceof ActiveFocusSessionError) {
      return NextResponse.json(
        { error: "ACTIVE_FOCUS_SESSION" },
        { status: 409 }
      );
    }
    if (error instanceof FocusExitError) {
      return NextResponse.json(
        { error: error.code, retryAfter: error.retryAfter ?? null },
        {
          status: 409,
          headers: error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : undefined,
        }
      );
    }
    await logger.error(
      "Focus session action failed",
      { action, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Focus session action failed" },
      { status: 500 }
    );
  }
}
