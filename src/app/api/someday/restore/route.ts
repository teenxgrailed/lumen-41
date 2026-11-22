import { NextRequest, NextResponse } from "next/server";

import {
  assertDayPlanOn,
  authorize,
  failure,
  parseBody,
} from "@/services/day-plan/http";
import { restoreSomeday } from "@/services/day-plan/someday";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "someday-restore-api";

const bodySchema = z
  .object({ taskIds: z.array(z.string().min(1)).min(1).max(500) })
  .strict();

/** POST /api/someday/restore: return Someday tasks to the normal lists. */
export async function POST(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "someday-restore",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    await assertDayPlanOn(auth.userId);
    const input = await parseBody(request, bodySchema);
    const restored = await restoreSomeday(auth.userId, input.taskIds);
    return NextResponse.json({ restored });
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
