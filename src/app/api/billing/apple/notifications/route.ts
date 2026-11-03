import { NextRequest, NextResponse } from "next/server";

import { processAppleNotification } from "@/services/billing/apple-iap";

import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "AppleNotificationsAPI";

/** A V2 notification is a few KB; anything far bigger is not Apple. */
const MAX_BODY_BYTES = 64 * 1024;

/** The body as text, or null once it passes `limit` bytes (stops reading). */
async function readCapped(
  request: NextRequest,
  limit: number
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * App Store Server Notifications V2 (public: Apple has no session). Trust
 * comes from the JWS chain to Apple's root alone; see
 * docs/billing/apple-iap.md for the status codes.
 */
export async function POST(request: NextRequest) {
  // Every request costs a chain check and Apple's OCSP round trip.
  const limited = await enforceRateLimits(
    [ipRule(request, "billing-apple-notifications:ip", 120, 60)],
    { route: "/api/billing/apple/notifications" }
  );
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  let body: { signedPayload?: unknown } | null = null;
  try {
    body = JSON.parse(text) as { signedPayload?: unknown } | null;
  } catch {
    body = null;
  }

  try {
    const result = await processAppleNotification(body?.signedPayload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    await logger.error(
      "Failed to process an App Store Server Notification",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    // Apple retries a non-200 for a few days; the receipt stays "received",
    // so the retry processes it again.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
