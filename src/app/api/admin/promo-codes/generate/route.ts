import { NextRequest, NextResponse } from "next/server";

import { generatePromoCode } from "@/services/promo/codes";

import { requireAdmin } from "@/lib/auth/api-auth";

export const runtime = "nodejs";

/** GET: a random code from a cryptographic source. Nothing is saved. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ code: generatePromoCode() });
}
