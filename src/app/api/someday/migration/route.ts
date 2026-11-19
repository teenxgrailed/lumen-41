import { NextRequest, NextResponse } from "next/server";

import { assertDayPlanOn, authorize, failure } from "@/services/day-plan/http";
import { getSomedayMigration } from "@/services/day-plan/someday";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "someday-migration-api";

/**
 * GET /api/someday/migration: how many of the person's old tasks the launch
 * migration moved to Someday, and whether they were all returned already.
 */
export async function GET(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "someday-migration",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    await assertDayPlanOn(auth.userId);
    return NextResponse.json(await getSomedayMigration(auth.userId));
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
