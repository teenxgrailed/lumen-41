import { NextRequest, NextResponse } from "next/server";

import { createHash, randomBytes } from "node:crypto";

import {
  calendarOAuthCookieOptions,
  calendarOAuthStateCookieValue,
  createCalendarOAuthState,
  isValidCalendarOAuthState,
} from "@/lib/calendar-oauth";

/**
 * OAuth `state` + PKCE for the mailbox-connect flows.
 *
 * Without this, a callback URL carrying an attacker's authorization code could
 * be opened in a logged-in victim's browser and bind the attacker's mailbox to
 * the victim's account (login CSRF). The state scheme is the calendar flow's:
 * a random value in the URL, mirrored in a short-lived httpOnly cookie that is
 * also bound to the signed-in user. PKCE adds a second binding: the code can
 * only be redeemed with the verifier held in this browser's cookie.
 *
 * Only the cookie path differs from the calendar flow, because the mail
 * routes live under /api/mail/oauth rather than /api/calendar.
 */

export type MailOAuthProvider = "google" | "outlook";

export const MAIL_OAUTH_COOKIE_PATH = "/api/mail/oauth";

const STATE_COOKIE_PREFIX = "needt-mail-oauth-state";
const VERIFIER_COOKIE_PREFIX = "needt-mail-oauth-verifier";
// RFC 7636 section 4.1: 43-128 unreserved characters.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export function mailOAuthStateCookie(provider: MailOAuthProvider) {
  return `${STATE_COOKIE_PREFIX}-${provider}`;
}

export function mailOAuthVerifierCookie(provider: MailOAuthProvider) {
  return `${VERIFIER_COOKIE_PREFIX}-${provider}`;
}

export function mailOAuthCookieOptions() {
  return { ...calendarOAuthCookieOptions(), path: MAIL_OAUTH_COOKIE_PATH };
}

/** Fresh state plus an S256 PKCE pair for one authorization attempt. */
export function createMailOAuthSession() {
  const codeVerifier = randomBytes(32).toString("base64url");
  return {
    state: createCalendarOAuthState(),
    codeVerifier,
    codeChallenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
  };
}

/** Binds the attempt to this browser and user on the redirect to the provider. */
export function setMailOAuthCookies(
  response: NextResponse,
  provider: MailOAuthProvider,
  userId: string,
  session: { state: string; codeVerifier: string }
) {
  const options = mailOAuthCookieOptions();
  response.cookies.set(
    mailOAuthStateCookie(provider),
    calendarOAuthStateCookieValue(session.state, userId),
    options
  );
  response.cookies.set(
    mailOAuthVerifierCookie(provider),
    session.codeVerifier,
    options
  );
  return response;
}

/**
 * The cookies are single use. They are scoped to /api/mail/oauth, so the
 * expiry must repeat that path or the browser keeps them.
 */
export function clearMailOAuthCookies(
  response: NextResponse,
  provider: MailOAuthProvider
) {
  const options = {
    ...mailOAuthCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  };
  response.cookies.set(mailOAuthStateCookie(provider), "", options);
  response.cookies.set(mailOAuthVerifierCookie(provider), "", options);
  return response;
}

export type MailOAuthCallbackCheck =
  | { valid: true; codeVerifier: string }
  | { valid: false };

/**
 * Fails closed: the callback is valid only when the `state` query parameter
 * matches the cookie set for this user and the PKCE verifier cookie is there.
 */
export function verifyMailOAuthCallback(
  request: NextRequest,
  provider: MailOAuthProvider,
  userId: string
): MailOAuthCallbackCheck {
  const stateCookie = request.cookies.get(mailOAuthStateCookie(provider));
  const received = request.nextUrl.searchParams.get("state");
  if (!isValidCalendarOAuthState(stateCookie?.value, received, userId)) {
    return { valid: false };
  }
  const codeVerifier = request.cookies.get(
    mailOAuthVerifierCookie(provider)
  )?.value;
  if (!codeVerifier || !CODE_VERIFIER_PATTERN.test(codeVerifier)) {
    return { valid: false };
  }
  return { valid: true, codeVerifier };
}

export function invalidMailOAuthStateResponse(provider: MailOAuthProvider) {
  return clearMailOAuthCookies(
    NextResponse.json({ error: "invalid_state" }, { status: 400 }),
    provider
  );
}
