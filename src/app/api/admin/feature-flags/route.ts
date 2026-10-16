import { NextRequest, NextResponse } from "next/server";

import { listAdminFlags } from "@/services/admin/flags";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminFeatureFlagsAPI";

export const runtime = "nodejs";

/** GET /api/admin/feature-flags : every flag, plus known ones with no row yet. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ flags: await listAdminFlags() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list feature flags",
      LOG_SOURCE,
      "Could not load the flags."
    );
  }
}
