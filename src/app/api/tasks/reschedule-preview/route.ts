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
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "reschedule-preview-api";

/* Who asked: the chat preview card (a preview is shown, Keep is pressed) or
   "Fill it" (placed in one click, nothing shown). Only the first counts as a
   replan in the activation metrics. */
const via = z.enum(["chat", "fill"]).default("chat");

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), via }),
  z.object({ action: z.literal("apply"), token: z.string().min(1), via }),
  z.object({ action: z.literal("undo"), token: z.string().min(1), via }),
]);

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
    const input = requestSchema.parse(await request.json().catch(() => null));
    if (input.action === "preview") {
      return NextResponse.json(
        await createReschedulePreview(auth.userId, auth.workspace!, {
          via: input.via,
        })
      );
    }
    if (input.action === "apply") {
      return NextResponse.json(
        await applyReschedulePreview(
          auth.userId,
          auth.workspace!,
          input.token,
          {
            via: input.via,
          }
        )
      );
    }
    return NextResponse.json(
      await undoReschedulePreview(auth.userId, auth.workspace!, input.token, {
        via: input.via,
      })
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
