import { NextRequest, NextResponse } from "next/server";

import {
  ClientError,
  cleanupUnusedClients,
  registerClient,
} from "@/services/oauth/clients";
import {
  CORS_HEADERS,
  corsPreflight,
  oauthErrorResponse,
} from "@/services/oauth/http";

import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "OAuthRegister";

/** RFC 7591 dynamic client registration, for clients without a CIMD URL. */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [
      ipRule(request, "oauth-register:ip:minute", 10, 60),
      ipRule(request, "oauth-register:ip:day", 200, 24 * 60 * 60),
    ],
    { route: "/oauth/register" }
  );
  if (limited) return limited;

  const raw = await request.text();
  if (raw.length > 16 * 1024) {
    return oauthErrorResponse("invalid_client_metadata", "Too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return oauthErrorResponse("invalid_client_metadata", "Send JSON.");
  }
  try {
    const registered = await registerClient(body);
    // Opportunistic cleanup of abandoned registrations; never blocks.
    void cleanupUnusedClients().catch((error) =>
      logger.warn(
        "OAuth client cleanup failed",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      )
    );
    return NextResponse.json(registered, {
      status: 201,
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClientError) {
      return oauthErrorResponse(error.code, error.message);
    }
    throw error;
  }
}

export async function OPTIONS() {
  return corsPreflight();
}
