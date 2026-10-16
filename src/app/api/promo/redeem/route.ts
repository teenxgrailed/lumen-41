import { NextRequest, NextResponse } from "next/server";

import { PromoError, redeemPromoCode } from "@/services/promo/redeem";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "PromoRedeemAPI";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().min(1).max(64) });

/**
 * POST /api/promo/redeem  `{ "code": "K7M2P-9XQ4R" }`
 * Applies a promo code to the signed-in account: more trial days, Pro for N
 * days, or Lifetime. Codes are case-insensitive. One redemption per person per
 * code. Errors carry a `code`: UNKNOWN 404, EXPIRED 410, USED_UP 409,
 * ALREADY_USED 409, NOT_ELIGIBLE 409.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;

  const limited = await enforceRateLimits(
    [
      ipRule(request, "promo-redeem:ip", 30, 60 * 60),
      accountRule(auth.userId, "promo-redeem:account", 10, 60 * 60),
    ],
    { route: "/api/promo/redeem", userId: auth.userId }
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a code.", code: "UNKNOWN" },
      { status: 400 }
    );
  }
  try {
    const redeemed = await redeemPromoCode(auth.userId, parsed.data.code);
    return NextResponse.json(redeemed);
  } catch (error) {
    if (error instanceof PromoError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Failed to redeem a promo code",
      LOG_SOURCE,
      "Could not apply the code."
    );
  }
}
