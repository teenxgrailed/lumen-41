import { encode } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/auth-options";
import { authSecret } from "@/lib/auth/auth-secret";
import {
  isDesktopHandoffRequest,
  redeemDesktopAuthCode,
  sessionCookieName,
} from "@/lib/auth/desktop-handoff";
import { issueSessionVersion } from "@/lib/auth/session-version";
import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "DesktopAuthExchangeAPI";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/desktop/exchange { code, verifier }
 * Called by the desktop app's own webview (page /auth/desktop-complete) to
 * turn the one-time code from `needt://auth` into a session cookie. Same-origin
 * JSON with the handoff header only; the code must be unused, unexpired and
 * issued for the challenge this verifier answers. Failure is always the same
 * 401, so nothing says which part was wrong.
 */
export async function POST(request: NextRequest) {
  if (!isDesktopHandoffRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE }
    );
  }
  const limited = await enforceRateLimits(
    [ipRule(request, "desktop-auth-exchange:ip", 20, 10 * 60)],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    verifier?: unknown;
  } | null;
  const user =
    typeof body?.code === "string" && typeof body.verifier === "string"
      ? await redeemDesktopAuthCode({
          code: body.code,
          verifier: body.verifier,
        })
      : null;
  if (!user) {
    logger.warn("Desktop sign-in code refused", {}, LOG_SOURCE);
    return NextResponse.json(
      { error: "This sign-in link is no longer valid. Start again." },
      { status: 401, headers: NO_STORE }
    );
  }

  const token = await issueSessionVersion(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      role: user.role,
      provider: "desktop",
    },
    user.id
  );
  const jwt = await encode({
    token,
    secret: authSecret(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const response = NextResponse.json(
    { ok: true, next: "/today" },
    { headers: NO_STORE }
  );
  const name = sessionCookieName();
  response.cookies.set(name, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: name.startsWith("__Secure-"),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  logger.info("Desktop session issued", { userId: user.id }, LOG_SOURCE);
  return response;
}
