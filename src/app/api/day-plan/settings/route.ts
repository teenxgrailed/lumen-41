import { NextRequest, NextResponse } from "next/server";

import { assertDayPlanOn, authorize, failure } from "@/services/day-plan/http";
import {
  getPlanSettings,
  suggestLimit,
  updatePlanSettings,
} from "@/services/day-plan/settings";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "day-plan-settings-api";
const ROUTE = "day-plan-settings";

/** GET /api/day-plan/settings: the limits, times and the limit suggestion. */
export async function GET(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    ROUTE,
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const [settings, limitSuggestion] = await Promise.all([
      getPlanSettings(auth.userId),
      suggestLimit(auth.userId),
    ]);
    return NextResponse.json({ settings, limitSuggestion });
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}

/**
 * PUT /api/day-plan/settings: change settings. A limit outside 3..10 or a focus
 * budget over 5 hours is a 400 naming the range; nothing is stored.
 */
export async function PUT(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    ROUTE,
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    await assertDayPlanOn(auth.userId);
    const body = await request.json().catch(() => null);
    const settings = await updatePlanSettings(auth.userId, body);
    return NextResponse.json({ settings });
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
