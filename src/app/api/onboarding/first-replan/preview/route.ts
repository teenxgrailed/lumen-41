import { NextRequest, NextResponse } from "next/server";

import { createTargetedReschedulePreview } from "@/services/ai/reschedule-preview";
import { firstReplanTarget } from "@/services/onboarding/first-replan-demo";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { FIRST_REPLAN_ONBOARDING } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "FirstReplanPreviewAPI";

/**
 * "Replan my day" on the demo card: moves the demo task to the first free
 * gap after the demo meeting, one that touches no other task or calendar
 * event on the person's days, and returns the usual preview (token, changes).
 * Keep and Undo then go through `/api/tasks/reschedule-preview` as always.
 * Nothing changes here: it is a preview.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    if (!(await isFeatureEnabled(FIRST_REPLAN_ONBOARDING, auth.userId))) {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    const target = await firstReplanTarget(auth.userId);
    if (!target) {
      return NextResponse.json({
        changes: [],
        unscheduled: [],
        previewToken: null,
      });
    }
    return NextResponse.json(
      await createTargetedReschedulePreview(auth.userId, auth.workspace!, {
        taskId: target.taskId,
        start: target.start,
        end: target.end,
      })
    );
  } catch (error) {
    logger.error(
      "Could not preview the first replan",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not preview the replan" },
      { status: 500 }
    );
  }
}
