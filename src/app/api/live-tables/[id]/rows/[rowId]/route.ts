import { NextRequest, NextResponse } from "next/server";

import {
  announceTableChange,
  liveTableErrorResponse,
} from "@/services/live-tables/live-table-http";
import {
  deleteLiveTableRow,
  updateLiveTableRow,
} from "@/services/live-tables/live-table-service";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { liveTableCellInput } from "@/lib/live-tables/schema";

const LOG_SOURCE = "LiveTableRowAPI";
type RouteContext = { params: Promise<{ id: string; rowId: string }> };

const patchSchema = z.object({
  cells: z.record(z.string(), liveTableCellInput),
});

/** `PATCH /api/live-tables/:id/rows/:rowId` - set cells by column id or name. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, rowId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cells", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const table = await updateLiveTableRow(auth, id, rowId, parsed.data.cells);
    await announceTableChange(auth.userId);
    return NextResponse.json({ table });
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to update row");
  }
}

/** `DELETE /api/live-tables/:id/rows/:rowId` */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, rowId } = await params;
  try {
    const table = await deleteLiveTableRow(auth, id, rowId);
    await announceTableChange(auth.userId);
    return NextResponse.json({ table });
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to delete row");
  }
}
