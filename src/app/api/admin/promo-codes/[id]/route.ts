import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import { PromoAdminError, deactivatePromoCode } from "@/services/promo/codes";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminPromoCodeAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// A code is switched off, never switched back on or deleted: its redemptions
// stay as the record of what was granted.
const patchSchema = z.object({ active: z.literal(false) });

/** PATCH `{ "active": false }` deactivates a code. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !patchSchema.safeParse(await request.json().catch(() => null)).success
    ) {
      return NextResponse.json(
        { error: "A code can only be deactivated." },
        { status: 400 }
      );
    }
    const { id } = await params;
    return NextResponse.json({ code: await deactivatePromoCode(actorId, id) });
  } catch (error) {
    if (error instanceof PromoAdminError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Failed to deactivate a promo code",
      LOG_SOURCE,
      "Could not deactivate the code."
    );
  }
}
