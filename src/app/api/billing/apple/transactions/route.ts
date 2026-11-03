import { NextRequest, NextResponse } from "next/server";

import { processAppleTransactionPost } from "@/services/billing/apple-iap";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { APPLE_IAP } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { publicRequestUrl } from "@/lib/public-url";
import { refuseSandbox } from "@/lib/sandbox/guard";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "AppleTransactionsAPI";

/**
 * JSON only, and from our own origin when a browser sends it. The native app
 * (URLSession) sends no Origin header; a cross-site page cannot send JSON
 * without a preflight, and its Origin is not ours.
 */
function isSameOriginJson(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  return !origin || origin === publicRequestUrl(request).origin;
}

/**
 * The app posts `Transaction.jwsRepresentation` after a purchase, a restore or
 * a `Transaction.updates` event. Answers with the `GET /api/billing` shape.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  // App Review buys with Apple's sandbox Apple ID on a real account it creates
  // (docs/billing/apple-iap.md); a Needt sandbox account never buys.
  const locked = await refuseSandbox(auth.userId, "billing");
  if (locked) return locked;

  if (!isSameOriginJson(request)) {
    return NextResponse.json(
      { error: "Send JSON from the Needt app.", code: "INVALID_ORIGIN" },
      { status: 403 }
    );
  }

  const limited = await enforceRateLimits(
    [
      ipRule(request, "billing-apple-transactions:ip", 60, 60 * 60),
      accountRule(
        auth.userId,
        "billing-apple-transactions:account",
        30,
        60 * 60
      ),
    ],
    { route: "/api/billing/apple/transactions", userId: auth.userId }
  );
  if (limited) return limited;

  if (!(await isFeatureEnabled(APPLE_IAP, auth.userId))) {
    return NextResponse.json(
      { error: "App Store purchases are not open yet.", code: "APPLE_IAP_OFF" },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    signedTransaction?: unknown;
  } | null;

  try {
    const result = await processAppleTransactionPost(
      auth.userId,
      body?.signedTransaction
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }
    return NextResponse.json(result.summary);
  } catch (error) {
    await logger.error(
      "Failed to apply an Apple transaction",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not apply the App Store purchase." },
      { status: 500 }
    );
  }
}
