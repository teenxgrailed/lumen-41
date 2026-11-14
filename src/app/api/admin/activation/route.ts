import { NextRequest, NextResponse } from "next/server";

import { getAdminActivation } from "@/services/admin/activation";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminActivationAPI";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ activation: await getAdminActivation() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load the activation counts",
      LOG_SOURCE,
      "Could not load the activation counts."
    );
  }
}
