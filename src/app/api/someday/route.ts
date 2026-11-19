import { NextRequest, NextResponse } from "next/server";

import { authorize, failure } from "@/services/day-plan/http";
import { listSomeday } from "@/services/day-plan/someday";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "someday-api";

/**
 * GET /api/someday: the person's Someday tasks. `?archived=1` lists what the
 * weekly cleanup archived instead (restorable).
 */
export async function GET(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "someday",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    return NextResponse.json(await listSomeday(auth.userId, { archived }));
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
