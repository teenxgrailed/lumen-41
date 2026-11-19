import { NextRequest, NextResponse } from "next/server";

import { authorize, failure, parseBody } from "@/services/day-plan/http";
import {
  dayPlanUpdateSchema,
  getDayPlan,
  updateDayPlan,
} from "@/services/day-plan/plan";
import { userTimeZone } from "@/services/day-plan/settings";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { habitDayKey } from "@/lib/habit-completion-date";

const LOG_SOURCE = "day-plan-api";
const ROUTE = "day-plan";

/** GET /api/day-plan?date=YYYY-MM-DD (default: today in the person's zone). */
export async function GET(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    ROUTE,
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const date =
      request.nextUrl.searchParams.get("date") ??
      habitDayKey(newDate(), await userTimeZone(auth.userId));
    return NextResponse.json(await getDayPlan(auth.userId, date));
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}

/** PUT /api/day-plan: arrange the plan of a date (add, remove, reorder, main). */
export async function PUT(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    ROUTE,
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const input = await parseBody(request, dayPlanUpdateSchema);
    return NextResponse.json({
      plan: await updateDayPlan(auth.userId, input),
    });
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
