import { NextRequest, NextResponse } from "next/server";

import {
  announceTableChange,
  liveTableErrorResponse,
} from "@/services/live-tables/live-table-http";
import { appendLiveTableRows } from "@/services/live-tables/live-table-service";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  LIVE_TABLE_MAX_ROWS_PER_APPEND,
  liveTableRowInput,
} from "@/lib/live-tables/schema";

const LOG_SOURCE = "LiveTableRowsAPI";
type RouteContext = { params: Promise<{ id: string }> };

const appendSchema = z.object({
  rows: z.array(liveTableRowInput).min(1).max(LIVE_TABLE_MAX_ROWS_PER_APPEND),
});

/** `POST /api/live-tables/:id/rows` - append rows (lists or objects by column name). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = appendSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid rows", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const table = await appendLiveTableRows(auth, id, parsed.data.rows);
    await announceTableChange(auth.userId);
    return NextResponse.json({ table }, { status: 201 });
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to add rows");
  }
}
