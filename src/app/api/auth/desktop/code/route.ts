import { NextRequest, NextResponse } from "next/server";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import {
  DESKTOP_CHALLENGE_PATTERN,
  isDesktopHandoffRequest,
  issueDesktopAuthCode,
} from "@/lib/auth/desktop-handoff";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "DesktopAuthCodeAPI";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/desktop/code { challenge }
 * Called by the confirmation page (/auth/desktop) after a normal browser
 * sign-in. Returns a one-time code, bound to the signed-in user and to the
 * app's challenge, that the page passes to the app as `needt://auth?code=`.
 * The code travels in this response body and then in the custom-scheme link
 * only: never in a page URL, so no Referer, history entry or access log has it.
 */
export async function POST(request: NextRequest) {
  if (!isDesktopHandoffRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE }
    );
  }
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  if (!auth.user.isActive) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE }
    );
  }
  const verification = await getEmailVerificationStatus(auth.user.id);
  if (verification.required && !verification.verified) {
    return NextResponse.json(
      { error: "Confirm your email to continue" },
      { status: 403, headers: NO_STORE }
    );
  }
  const limited = await enforceRateLimits(
    [
      ipRule(request, "desktop-auth-code:ip", 30, 60 * 60),
      accountRule(auth.user.id, "desktop-auth-code:user", 10, 60 * 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    challenge?: unknown;
  } | null;
  const challenge = body?.challenge;
  if (
    typeof challenge !== "string" ||
    !DESKTOP_CHALLENGE_PATTERN.test(challenge)
  ) {
    return NextResponse.json(
      { error: "Invalid challenge" },
      { status: 400, headers: NO_STORE }
    );
  }

  const code = await issueDesktopAuthCode({
    userId: auth.user.id,
    challenge,
  });
  logger.info(
    "Desktop sign-in code issued",
    { userId: auth.user.id },
    LOG_SOURCE
  );
  return NextResponse.json({ code }, { headers: NO_STORE });
}
