import { NextRequest, NextResponse } from "next/server";

import {
  buildPinterestAuthorizeUrl,
  getPinterestOAuthConfig,
  pinterestRedirectUri,
} from "@/services/pinterest/client";
import {
  PINTEREST_STATE_COOKIE,
  PINTEREST_STATE_TTL_SECONDS,
  assertPinterestPlan,
  createPinterestState,
} from "@/services/pinterest/connection";
import { pinterestErrorResponse } from "@/services/pinterest/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "PinterestAuthorize";

/**
 * Browser step one: set the nonce cookie and send the person to Pinterest's
 * consent page (read-only: boards:read, pins:read). `?moodboard=<id>` is where
 * the callback brings them back to.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const config = getPinterestOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "Pinterest is not set up on this server",
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }
  try {
    await assertPinterestPlan(auth.userId);
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Pinterest connect refused",
      LOG_SOURCE,
      "Could not connect Pinterest."
    );
  }
  const { state, nonce } = createPinterestState(
    auth.userId,
    request.nextUrl.searchParams.get("moodboard") ?? undefined
  );
  const response = NextResponse.redirect(
    buildPinterestAuthorizeUrl(config, state, pinterestRedirectUri(request))
  );
  response.cookies.set(PINTEREST_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/pinterest",
    maxAge: PINTEREST_STATE_TTL_SECONDS,
  });
  return response;
}
