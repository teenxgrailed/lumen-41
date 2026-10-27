import { NextRequest, NextResponse } from "next/server";

import {
  SchedulePreviewConflictError,
  applyReschedulePreview,
  createReschedulePreview,
  undoReschedulePreview,
} from "@/services/ai/reschedule-preview";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "reschedule-preview-api";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview") }),
  z.object({ action: z.literal("apply"), token: z.string().min(1) }),
  z.object({ action: z.literal("undo"), token: z.string().min(1) }),
]);

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;
    const input = requestSchema.parse(await request.json().catch(() => null));
    if (input.action === "preview") {
      return NextResponse.json(
        await createReschedulePreview(auth.userId, auth.workspace!)
      );
    }
    if (input.action === "apply") {
      return NextResponse.json(
        await applyReschedulePreview(auth.userId, auth.workspace!, input.token)
      );
    }
    return NextResponse.json(
      await undoReschedulePreview(auth.userId, auth.workspace!, input.token)
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
