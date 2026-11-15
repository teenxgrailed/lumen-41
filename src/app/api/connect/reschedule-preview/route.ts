import { NextRequest, NextResponse } from "next/server";

import { SchedulePreviewConflictError } from "@/services/ai/reschedule-preview";
import { runReschedulePreviewAction } from "@/services/ai/reschedule-preview-api";
import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { WorkspaceRole } from "@prisma/client";
import { ZodError } from "zod";

import { logger } from "@/lib/logger";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "connect-reschedule-preview-api";

/**
 * `POST /api/connect/reschedule-preview` with a bearer token: the same
 * preview / apply / undo as the app's `/api/tasks/reschedule-preview`.
 * `{ action: "preview", taskIds }` re-plans only those tasks; the returned
 * `previewToken` applies exactly that set and the `undoToken` that apply
 * returns undoes exactly that set.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  try {
    const limited = await enforceRateLimits(
      [accountRule(auth.userId, "connect-reschedule-preview:account", 20, 60)],
      { route: "/api/connect/reschedule-preview", userId: auth.userId }
    );
    if (limited) return limited;
    return NextResponse.json(
      await runReschedulePreviewAction(
        auth.userId,
        auth.workspace,
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
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request", issues: error.issues },
        { status: 400 }
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
