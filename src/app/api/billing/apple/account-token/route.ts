import { NextRequest, NextResponse } from "next/server";

import { appleAccountToken } from "@/services/billing/apple-iap";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "AppleAccountTokenAPI";

/**
 * The StoreKit 2 appAccountToken the app attaches to every purchase, whether
 * App Store purchases are on (`apple_iap`), and which products to offer.
 * docs/billing/apple-iap.md.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await appleAccountToken(auth.userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    await logger.error(
      "Failed to read the Apple account token",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not load App Store purchase settings." },
      { status: 500 }
    );
  }
}
