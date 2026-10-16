import { NextRequest, NextResponse } from "next/server";

import { getAdminOverview } from "@/services/admin/overview";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { readBuildInfo } from "@/lib/health/build-info";

const LOG_SOURCE = "AdminOverviewAPI";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const [overview, build] = await Promise.all([
      getAdminOverview(),
      readBuildInfo(),
    ]);
    return NextResponse.json({ overview, build });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load the admin overview",
      LOG_SOURCE,
      "Could not load the overview."
    );
  }
}
