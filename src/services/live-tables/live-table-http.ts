import { NextResponse } from "next/server";

import { liveTableErrorStatus } from "@/services/live-tables/live-table-errors";

import { routeErrorResponse } from "@/lib/api/route-error";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

/** Known failures keep their status; anything else is a logged 500. */
export async function liveTableErrorResponse(
  error: unknown,
  source: string,
  message: string
) {
  const known = liveTableErrorStatus(error);
  if (known) {
    return NextResponse.json({ error: known.error }, { status: known.status });
  }
  return routeErrorResponse(
    error,
    message,
    source,
    "Could not save the table."
  );
}

/** Tell the writer's other open sessions to refetch their tables. */
export function announceTableChange(userId: string) {
  return publishRealtimeEventSafe(userId, "tables-updated");
}
