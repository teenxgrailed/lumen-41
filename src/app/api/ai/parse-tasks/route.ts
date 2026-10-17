import { NextRequest, NextResponse } from "next/server";

import { parseTasksFallback } from "@/services/ai/fallback-parser";
import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
} from "@/services/ai/settings";
import {
  HOSTED_AI_BUSY_MESSAGE,
  HOSTED_AI_RESTING_MESSAGE,
  HostedAiQueueError,
} from "@/services/ai/slow-queue";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-parse-tasks-api";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const limited = await enforceRateLimits(
      [
        ipRule(request, "ai-parse-tasks:ip", 60, 60),
        accountRule(auth.userId, "ai-parse-tasks:account", 30, 60),
      ],
      { route: "/api/ai/parse-tasks", userId: auth.userId }
    );
    if (limited) return limited;

    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const configured = await getConfiguredSchedulerAI(auth.userId);
    const { settings } = configured;

    if (!settings.allowParseTasks || !text.trim()) {
      return NextResponse.json({
        tasks: parseTasksFallback(text),
        fallback: true,
      });
    }

    try {
      const { ai, source, usage, hostedMode } = await getPreparedSchedulerAI(
        auth.userId,
        configured
      );
      if (source === "none") {
        return NextResponse.json({
          tasks: parseTasksFallback(text),
          fallback: true,
          notice: usage.exhausted ? HOSTED_AI_RESTING_MESSAGE : undefined,
        });
      }
      const tasks = await ai.parseTasks(text);
      return NextResponse.json({
        tasks,
        fallback: false,
        notice: hostedMode === "slow" ? HOSTED_AI_BUSY_MESSAGE : undefined,
      });
    } catch (error) {
      logger.warn(
        "AI parse failed, falling back",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return NextResponse.json({
        tasks: parseTasksFallback(text),
        fallback: true,
        notice:
          error instanceof HostedAiQueueError
            ? HOSTED_AI_BUSY_MESSAGE
            : undefined,
      });
    }
  } catch (error) {
    logger.error(
      "Failed to parse tasks",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to parse tasks" },
      { status: 500 }
    );
  }
}
