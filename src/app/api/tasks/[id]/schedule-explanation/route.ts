import { NextRequest, NextResponse } from "next/server";

import { AutoScheduleSettingsMissingError } from "@/services/scheduling/errors";
import { explainTaskSchedule } from "@/services/scheduling/explain";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ScheduleExplanationAPI";

/**
 * GET: why an auto-scheduled task is at its time, from the scheduler's own
 * inputs. Read-only — the pass runs in memory and nothing is written.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const explanation = await explainTaskSchedule(
      auth.userId,
      auth.workspace!,
      id
    );
    if (!explanation) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(explanation);
  } catch (error) {
    if (error instanceof AutoScheduleSettingsMissingError) {
      return NextResponse.json(
        { error: "Auto-schedule settings are required." },
        { status: 409 }
      );
    }
    logger.error(
      "Schedule explanation failed",
      { error: error instanceof Error ? error.message : String(error), id },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not explain this time" },
      { status: 500 }
    );
  }
}
