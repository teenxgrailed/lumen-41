import { NextRequest, NextResponse } from "next/server";

import { parseTasksForUser } from "@/services/ai/parse-tasks";

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
    return NextResponse.json(await parseTasksForUser(auth.userId, text));
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
