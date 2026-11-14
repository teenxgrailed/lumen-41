import { NextRequest, NextResponse } from "next/server";

import {
  ONE_TAP_NONCE_TTL_SECONDS,
  issueOneTapNonce,
  oneTapNonceCookieName,
  staleOneTapNonceCookies,
} from "@/lib/auth/google-one-tap-nonce";
import {
  isProviderConfigured,
  readSignInProviderConfig,
} from "@/lib/auth/sign-in-providers";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "GoogleClientAPI";

export const dynamic = "force-dynamic";

/* The Google config changes by hand in System Settings, so a few seconds of
   memory is enough to keep an unauthenticated GET from reading the database
   every time. */
const CONFIG_CACHE_MS = 10_000;
let cached: { at: number; clientId: string | null } | null = null;

async function googleClientId(): Promise<string | null> {
  const now = newDate().getTime();
  if (cached && now - cached.at < CONFIG_CACHE_MS) return cached.clientId;
  const config = await readSignInProviderConfig();
  const clientId = isProviderConfigured("google", config)
    ? config.google.clientId
    : null;
  cached = { at: now, clientId };
  return clientId;
}

/** Tests: forget the cached config. */
export function resetGoogleClientCache() {
  cached = null;
}

/**
 * What Google One Tap on the sign-in page needs: the Google OAuth client id
 * (public; it is in every Google redirect URL) and a nonce for the ID token.
 * The nonce is also left in a signed httpOnly cookie, which the sign-in
 * requires to match. Both are null when Google sign-in is not configured.
 */
export async function GET(request: NextRequest) {
  try {
    /* Each call sets a cookie, so it is limited per IP. */
    const limited = await enforceRateLimits(
      [ipRule(request, "onetap-config:ip", 60, 15 * 60)],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;
    const clientId = await googleClientId();
    if (!clientId) {
      return NextResponse.json({ clientId: null, nonce: null });
    }
    const { nonce, cookie } = issueOneTapNonce(newDate().getTime());
    const response = NextResponse.json({ clientId, nonce });
    const issuedName = oneTapNonceCookieName(nonce);
    /* Cap the jar: keep this nonce and the newest other one, expire the rest. */
    for (const name of staleOneTapNonceCookies(
      request.cookies.getAll(),
      issuedName
    )) {
      /* Through the cookie jar: a later cookies.set rewrites raw headers. */
      response.cookies.set(name, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    response.cookies.set(oneTapNonceCookieName(nonce), cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_TAP_NONCE_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    logger.error(
      "Failed to read the Google client id",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ clientId: null, nonce: null });
  }
}
