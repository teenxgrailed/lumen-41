import { NextRequest, NextResponse } from "next/server";

import {
  announceTableChange,
  liveTableErrorResponse,
} from "@/services/live-tables/live-table-http";
import { createLiveTable } from "@/services/live-tables/live-table-service";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  LIVE_TABLE_MAX_COLUMNS,
  LIVE_TABLE_MAX_ROWS_PER_APPEND,
  liveTableColumnInput,
  liveTableRowInput,
} from "@/lib/live-tables/schema";

const LOG_SOURCE = "LiveTablesAPI";

const createSchema = z.object({
  pageId: z.string().min(1).optional(),
  pageTitle: z.string().max(240).optional(),
  parentId: z.string().min(1).optional(),
  title: z.string().min(1).max(240),
  columns: z.array(liveTableColumnInput).min(1).max(LIVE_TABLE_MAX_COLUMNS),
  rows: z
    .array(liveTableRowInput)
    .max(LIVE_TABLE_MAX_ROWS_PER_APPEND)
    .optional(),
});

/**
 * `POST /api/live-tables` - create a table and place it at the end of
 * `pageId`, or on a new page when `pageId` is left out.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = createSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid table", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const table = await createLiveTable(auth, parsed.data);
    await announceTableChange(auth.userId);
    return NextResponse.json({ table }, { status: 201 });
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to create table");
  }
}
