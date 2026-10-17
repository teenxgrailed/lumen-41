import { NextRequest, NextResponse } from "next/server";

import {
  LIFETIME_BUYER_CAP,
  lifetimeSeatsSold,
} from "@/lib/creem/lifetime-cap";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "LifetimeSeatsAPI";

/**
 * GET /api/lifetime-seats — public, no auth, for the landing page's counter.
 * `sold` is the same count the Lifetime cap uses (buyers plus open checkout
 * holds), so the counter and the checkout never disagree. Kept in memory for
 * five minutes and sent with the same max-age.
 */

const CACHE_MS = 5 * 60 * 1000;
const LANDING_ORIGINS = new Set(["https://needt.app", "https://www.needt.app"]);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

let cached: { sold: number; at: number } | null = null;

/** Test hook: forget the in-memory answer. */
export function resetLifetimeSeatsCache() {
  cached = null;
}

function allowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (LANDING_ORIGINS.has(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && DEV_ORIGIN.test(origin)) {
    return origin;
  }
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (!origin) return headers;
  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function OPTIONS(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (!origin) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(null) });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: NextRequest) {
  const origin = allowedOrigin(request);
  // A browser on another site is refused; curl and servers send no Origin.
  if (request.headers.has("origin") && !origin) {
    return NextResponse.json(
      { error: "origin_not_allowed" },
      { status: 403, headers: corsHeaders(null) }
    );
  }

  try {
    const now = Date.now();
    if (!cached || now - cached.at >= CACHE_MS) {
      cached = { sold: await lifetimeSeatsSold(), at: now };
    }
    return NextResponse.json(
      { sold: cached.sold, total: LIFETIME_BUYER_CAP },
      {
        headers: {
          ...corsHeaders(origin),
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (error) {
    logger.error(
      "Failed to count Lifetime seats",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "unavailable" },
      {
        status: 500,
        headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
      }
    );
  }
}
