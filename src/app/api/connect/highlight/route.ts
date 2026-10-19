import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { highlightView, personDay } from "@/services/connectors/today";
import { DAY_KEY } from "@/services/highlight/highlight-service";
import { WorkspaceRole } from "@prisma/client";

import { newDate } from "@/lib/date-utils";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/connect/highlight?date=YYYY-MM-DD (needt.read): the day's Daily
 * Highlight as { date, highlight }. Without `date` it is the person's today.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  const asked = request.nextUrl.searchParams.get("date");
  if (asked !== null && !DAY_KEY.test(asked)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400, headers: NO_STORE }
    );
  }
  const date = asked ?? (await personDay(auth.userId, newDate())).date;
  const highlight = await highlightView(
    { userId: auth.userId, workspace: auth.workspace },
    date
  );
  return NextResponse.json({ date, highlight }, { headers: NO_STORE });
}
