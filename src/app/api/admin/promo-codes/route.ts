import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import {
  PromoAdminError,
  createPromoCode,
  createPromoSchema,
  listPromoCodes,
} from "@/services/promo/codes";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminPromoCodesAPI";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ codes: await listPromoCodes() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list promo codes",
      LOG_SOURCE,
      "Could not load the codes."
    );
  }
}

/** POST: `{ code, kind: trial_days|pro_days|lifetime, value?, maxRedemptions?, expiresAt? }`. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = createPromoSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "That code is not valid." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { code: await createPromoCode(actorId, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PromoAdminError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Failed to create a promo code",
      LOG_SOURCE,
      "Could not create the code."
    );
  }
}
