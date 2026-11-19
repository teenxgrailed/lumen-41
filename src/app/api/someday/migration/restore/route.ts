import { NextRequest, NextResponse } from "next/server";

import { assertDayPlanOn, authorize, failure } from "@/services/day-plan/http";
import { restoreSomedayMigration } from "@/services/day-plan/someday";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "someday-migration-restore-api";

/**
 * POST /api/someday/migration/restore: "Return all". Restores exactly the
 * tasks the launch migration moved for this person; tasks they parked in
 * Someday by hand stay where they are.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "someday-migration-restore",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    await assertDayPlanOn(auth.userId);
    return NextResponse.json(await restoreSomedayMigration(auth.userId));
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
