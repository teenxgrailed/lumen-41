import { NextRequest, NextResponse } from "next/server";

import { listPromoRedemptions } from "@/services/promo/codes";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminPromoRedemptionsAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    return NextResponse.json({ redemptions: await listPromoRedemptions(id) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list promo redemptions",
      LOG_SOURCE,
      "Could not load the redemptions."
    );
  }
}
