import { NextRequest, NextResponse } from "next/server";

import { listBugReports } from "@/services/bug-reports/bug-report-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminBugReportsAPI";

export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;
  try {
    return NextResponse.json({ reports: await listBugReports() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list bug reports",
      LOG_SOURCE,
      "Could not load reports."
    );
  }
}
