import { NextResponse } from "next/server";

import {
  ONE_TAP_NONCE_COOKIE,
  ONE_TAP_NONCE_TTL_SECONDS,
  issueOneTapNonce,
} from "@/lib/auth/google-one-tap-nonce";
import {
  isProviderConfigured,
  readSignInProviderConfig,
} from "@/lib/auth/sign-in-providers";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GoogleClientAPI";

export const dynamic = "force-dynamic";

/**
 * What Google One Tap on the sign-in page needs: the Google OAuth client id
 * (public; it is in every Google redirect URL) and a nonce for the ID token.
 * The nonce is also left in a signed httpOnly cookie, which the sign-in
 * requires to match. Both are null when Google sign-in is not configured.
 */
export async function GET() {
  try {
    const config = await readSignInProviderConfig();
    if (!isProviderConfigured("google", config)) {
      return NextResponse.json({ clientId: null, nonce: null });
    }
    const { nonce, cookie } = issueOneTapNonce(newDate().getTime());
    const response = NextResponse.json({
      clientId: config.google.clientId,
      nonce,
    });
    response.cookies.set(ONE_TAP_NONCE_COOKIE, cookie, {
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
