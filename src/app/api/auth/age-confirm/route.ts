import { NextRequest, NextResponse } from "next/server";

import {
  AGE_COOKIE,
  AGE_COOKIE_TTL_SECONDS,
  issueAgeToken,
} from "@/lib/auth/age-confirmation";
import { newDate } from "@/lib/date-utils";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

/**
 * Leaves the signed cookie that lets an OAuth sign-in create an account. The
 * page calls this only after the person ticks "I'm 16 or older and agree to
 * the Terms and Privacy Policy"; the sign-in callback refuses to create a user
 * without it (src/lib/auth/age-confirmation.ts).
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "age-confirm:ip", 30, 60 * 60)],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    (body as { confirmed?: unknown }).confirmed !== true
  ) {
    return NextResponse.json(
      { error: "Confirmation required" },
      { status: 400 }
    );
  }

  const secure = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AGE_COOKIE, issueAgeToken(newDate().getTime()), {
    httpOnly: true,
    secure,
    // Apple returns by a cross-site POST; Lax would drop the cookie there.
    sameSite: secure ? "none" : "lax",
    path: "/",
    maxAge: AGE_COOKIE_TTL_SECONDS,
  });
  return response;
}
