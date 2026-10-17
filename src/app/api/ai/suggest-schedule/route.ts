import { NextRequest, NextResponse } from "next/server";

import { getPreparedSchedulerAI } from "@/services/ai/settings";
import {
  HOSTED_AI_BUSY_MESSAGE,
  HOSTED_AI_RESTING_MESSAGE,
  HostedAiQueueError,
} from "@/services/ai/slow-queue";
import { AISuggestion, SchedulingContext } from "@/services/ai/types";
import { getCalibrationContext } from "@/services/time-tracking/calibration";

import { APP_NAME } from "@/lib/app-config";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-suggest-schedule-api";
const FALLBACK: AISuggestion = {
  summary: "Deterministic schedule kept.",
  moves: [],
  warnings: [
    `AI was unavailable, so ${APP_NAME} kept the deterministic schedule.`,
  ],
};

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const limited = await enforceRateLimits(
      [
        ipRule(request, "ai-suggest-schedule:ip", 60, 60),
        accountRule(auth.userId, "ai-suggest-schedule:account", 20, 60),
      ],
      { route: "/api/ai/suggest-schedule", userId: auth.userId }
    );
    if (limited) return limited;

    const context = (await request.json()) as SchedulingContext;
    context.calibration = await getCalibrationContext(auth.userId);
    try {
      const { ai, source, usage, hostedMode } = await getPreparedSchedulerAI(
        auth.userId
      );
      if (source === "none") {
        return NextResponse.json({
          suggestion: FALLBACK,
          fallback: true,
          notice: usage.exhausted ? HOSTED_AI_RESTING_MESSAGE : undefined,
        });
      }
      const suggestion = await ai.suggestSchedule(context);
      return NextResponse.json({
        suggestion,
        fallback: false,
        notice: hostedMode === "slow" ? HOSTED_AI_BUSY_MESSAGE : undefined,
      });
    } catch (error) {
      logger.warn(
        "AI schedule suggestion failed, falling back",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return NextResponse.json({
        suggestion: FALLBACK,
        fallback: true,
        notice:
          error instanceof HostedAiQueueError
            ? HOSTED_AI_BUSY_MESSAGE
            : undefined,
      });
    }
  } catch (error) {
    logger.error(
      "Failed to suggest schedule",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to suggest schedule" },
      { status: 500 }
    );
  }
}
