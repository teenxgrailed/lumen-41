import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { habitsToday, personDay } from "@/services/connectors/today";
import { WorkspaceRole } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/** GET /api/connect/habits/today (needt.read): each habit with today's state. */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  const day = await personDay(auth.userId, newDate());
  const habits = await habitsToday(
    { userId: auth.userId, workspace: auth.workspace },
    day
  );
  return NextResponse.json(
    { date: day.date, timeZone: day.timeZone, habits },
    { headers: NO_STORE }
  );
}
