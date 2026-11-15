import { NextRequest, NextResponse } from "next/server";

import { getOverviewStats } from "@/services/admin/overview-stats-data";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { readBuildInfo } from "@/lib/health/build-info";

const LOG_SOURCE = "AdminOverviewAPI";

export const runtime = "nodejs";

/**
 * Internal accounts (ours: admins, sandbox, test addresses) are left out of
 * every number unless the caller asks for `?internal=include`.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const excludeInternal =
      request.nextUrl.searchParams.get("internal") !== "include";
    const [stats, build] = await Promise.all([
      getOverviewStats(excludeInternal),
      readBuildInfo(),
    ]);
    return NextResponse.json({ stats, build });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load the admin overview",
      LOG_SOURCE,
      "Could not load the overview."
    );
  }
}
