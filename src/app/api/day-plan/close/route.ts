import { NextRequest, NextResponse } from "next/server";

import {
  assertDayPlanOn,
  authorize,
  failure,
  parseBody,
} from "@/services/day-plan/http";
import { closeDay, closeDaySchema } from "@/services/day-plan/plan";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "day-plan-close-api";

/**
 * POST /api/day-plan/close: close a day. Every unfinished planned task needs
 * one resolution (tomorrow, someday or delete) or nothing changes.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "day-plan-close",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    await assertDayPlanOn(auth.userId);
    const input = await parseBody(request, closeDaySchema);
    return NextResponse.json(
      await closeDay(auth.userId, input, { channel: "app" })
    );
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
