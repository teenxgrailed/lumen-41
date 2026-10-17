import { NextRequest, NextResponse } from "next/server";

import { getPinterestOAuthConfig } from "@/services/pinterest/client";
import {
  getConnection,
  hasPinterestPlan,
} from "@/services/pinterest/connection";
import { pinterestErrorResponse } from "@/services/pinterest/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "PinterestStatusAPI";

/** Is Pinterest set up here, does this plan include it, and is the person connected? */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const [pro, connection] = await Promise.all([
      hasPinterestPlan(auth.userId),
      getConnection(auth.userId),
    ]);
    return NextResponse.json({
      configured: getPinterestOAuthConfig() !== null,
      pro,
      connected: connection?.status === "CONNECTED",
      needsReconnect: connection?.status === "ERROR",
      username: connection?.username ?? null,
    });
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Failed to read Pinterest status",
      LOG_SOURCE,
      "Could not load Pinterest."
    );
  }
}
