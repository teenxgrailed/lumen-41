import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { safeCallbackPath } from "@/lib/auth/callback-url";
import { logger } from "@/lib/logger";
import {
  RESUMED_COOKIE,
  SETUP_PATH,
  onboardingEntryPath,
  resolveOnboardingTarget,
} from "@/lib/onboarding/entry";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "OnboardingResumeAPI";
const RESUMED_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sends a signed-in person to the onboarding flow they belong in: `/start`
 * when `onboarding_v3` is on for them, `/setup` otherwise. NextAuth's
 * `newUser` page and a credentials sign-up land here; Today sends people
 * here once (`?from=today`), which leaves a cookie so it does not repeat.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.redirect(publicAppUrl("/auth/signin", request));
  }
  const params = request.nextUrl.searchParams;
  const callback = params.get("callbackUrl");
  let entry = SETUP_PATH;
  try {
    entry = await onboardingEntryPath(userId);
  } catch (error) {
    logger.error(
      "Could not read the onboarding flag; using setup",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
  const target = resolveOnboardingTarget(
    entry,
    callback ? safeCallbackPath(callback) : null
  );
  const response = NextResponse.redirect(publicAppUrl(target, request));
  if (params.get("from") === "today") {
    response.cookies.set(RESUMED_COOKIE, "1", {
      path: "/",
      maxAge: RESUMED_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
