import { NextRequest, NextResponse } from "next/server";

import {
  exchangePinterestCode,
  getPinterestAccount,
  getPinterestOAuthConfig,
  pinterestRedirectUri,
} from "@/services/pinterest/client";
import {
  PINTEREST_STATE_COOKIE,
  hasPinterestPlan,
  saveConnection,
  verifyPinterestState,
} from "@/services/pinterest/connection";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "PinterestCallback";

function back(
  request: NextRequest,
  moodboardId: string | null,
  result: string
) {
  const url = publicAppUrl(
    moodboardId ? `/moodboards/${moodboardId}` : "/connections",
    request
  );
  url.searchParams.set("pinterest", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(PINTEREST_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/pinterest",
    maxAge: 0,
  });
  return response;
}

/**
 * Browser step two: Pinterest sends the person back with `code` and `state`
 * (or `error` when they cancel). The state must be signed for this session's
 * user and match the nonce cookie; then the code becomes encrypted tokens
 * stored on the person, and they land back on the moodboard (or Connections).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const verified = verifyPinterestState(
    request.nextUrl.searchParams.get("state"),
    auth.userId,
    request.cookies.get(PINTEREST_STATE_COOKIE)?.value
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired Pinterest state" },
      { status: 400 }
    );
  }
  if (request.nextUrl.searchParams.get("error")) {
    return back(request, verified.moodboardId, "denied");
  }
  const code = request.nextUrl.searchParams.get("code");
  const config = getPinterestOAuthConfig();
  if (!code || !config) return back(request, verified.moodboardId, "failed");
  try {
    if (!(await hasPinterestPlan(auth.userId)))
      return back(request, verified.moodboardId, "pro");
    const tokens = await exchangePinterestCode(
      config,
      code,
      pinterestRedirectUri(request)
    );
    const account = await getPinterestAccount(tokens.accessToken).catch(() => ({
      username: null,
    }));
    await saveConnection(auth.userId, tokens, account.username);
    return back(request, verified.moodboardId, "connected");
  } catch (error) {
    await logger.error(
      "Pinterest connect failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return back(request, verified.moodboardId, "failed");
  }
}
