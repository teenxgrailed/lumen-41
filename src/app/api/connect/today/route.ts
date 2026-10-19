import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { todayView } from "@/services/connectors/today";
import { WorkspaceRole } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/connect/today (needt.read): one compact payload for widgets and
 * dashboards: counts, the next task, the highlight, habits, the next event
 * and personal-time block, free minutes left and the weather line. "Today" is
 * the day in the person's saved time zone.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  return NextResponse.json(
    await todayView(
      { userId: auth.userId, workspace: auth.workspace },
      newDate()
    ),
    { headers: NO_STORE }
  );
}
