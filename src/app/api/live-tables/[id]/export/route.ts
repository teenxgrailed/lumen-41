import { NextRequest, NextResponse } from "next/server";

import { liveTableErrorResponse } from "@/services/live-tables/live-table-http";
import { getLiveTable } from "@/services/live-tables/live-table-service";
import { liveTableWorkbook } from "@/services/live-tables/live-table-xlsx";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { exportFileName } from "@/lib/pages/export-markdown";

const LOG_SOURCE = "LiveTableExportAPI";
type RouteContext = { params: Promise<{ id: string }> };

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** `GET /api/live-tables/:id/export` - the table as an .xlsx download. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const table = await getLiveTable(auth, id);
    const workbook = await liveTableWorkbook(table);
    const name = exportFileName(table.title, "xlsx");
    const ascii = name.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return liveTableErrorResponse(error, LOG_SOURCE, "Failed to export table");
  }
}
