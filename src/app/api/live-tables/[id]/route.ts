import { NextRequest, NextResponse } from "next/server";

import { liveTableErrorResponse } from "@/services/live-tables/live-table-http";
import { getLiveTable } from "@/services/live-tables/live-table-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "LiveTableAPI";
type RouteContext = { params: Promise<{ id: string }> };

/** `GET /api/live-tables/:id` - columns and rows; needs read access to the page. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const table = await getLiveTable(auth, id);
    return NextResponse.json(
      { table },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to load table");
  }
}
