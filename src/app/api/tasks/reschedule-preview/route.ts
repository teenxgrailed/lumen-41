import { NextRequest, NextResponse } from "next/server";

import { SchedulePreviewConflictError } from "@/services/ai/reschedule-preview";
import { runReschedulePreviewAction } from "@/services/ai/reschedule-preview-api";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "reschedule-preview-api";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;
    // not an AI action, so it stays on Free; the limit (20 a minute) only stops a runaway loop
    const limited = await enforceRateLimits(
      [accountRule(auth.userId, "tasks-reschedule-preview:account", 20, 60)],
      { route: "/api/tasks/reschedule-preview", userId: auth.userId }
    );
    if (limited) return limited;
    return NextResponse.json(
      await runReschedulePreviewAction(
        auth.userId,
        auth.workspace!,
        await request.json().catch(() => null)
      )
    );
  } catch (error) {
    if (error instanceof SchedulePreviewConflictError) {
      return NextResponse.json(
        { error: error.message, code: "SCHEDULE_PREVIEW_STALE" },
        { status: 409 }
      );
    }
    logger.error(
      "Schedule preview operation failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Schedule preview failed",
      },
      { status: 400 }
    );
  }
}
