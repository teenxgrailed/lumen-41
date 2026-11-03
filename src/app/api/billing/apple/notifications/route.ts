import { NextRequest, NextResponse } from "next/server";

import { processAppleNotification } from "@/services/billing/apple-iap";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "AppleNotificationsAPI";

/**
 * App Store Server Notifications V2 (public: Apple has no session). Trust
 * comes from the JWS chain to Apple's root alone; see
 * docs/billing/apple-iap.md for the status codes.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    signedPayload?: unknown;
  } | null;
  try {
    const result = await processAppleNotification(body?.signedPayload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    await logger.error(
      "Failed to process an App Store Server Notification",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    // Apple retries a non-200 for a few days; a database hiccup is worth it.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
