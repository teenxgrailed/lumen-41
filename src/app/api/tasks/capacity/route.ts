import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getScheduleCapacity } from "@/services/scheduling/capacity";

const LOG_SOURCE = "ScheduleCapacityAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsedDays = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isInteger(parsedDays)
    ? Math.min(21, Math.max(1, parsedDays))
    : 7;
  const capacity = await getScheduleCapacity(
    auth.userId,
    auth.workspace!,
    days
  );
  if (!capacity) {
    return NextResponse.json(
      { error: "Auto-schedule settings are required." },
      { status: 409 }
    );
  }
  return NextResponse.json(capacity);
}
