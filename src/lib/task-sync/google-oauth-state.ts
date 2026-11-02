import { NextRequest, NextResponse } from "next/server";

import {
  calendarOAuthCookieOptions,
  calendarOAuthStateCookieValue,
  isValidCalendarOAuthState,
} from "@/lib/calendar-oauth";
import { createMailOAuthSession } from "@/lib/mail/oauth-state";

/**
 * OAuth `state` + PKCE for the Google Tasks connect, the same scheme as the
 * calendar and mailbox connects: a random `state` in the URL mirrored in a
 * short-lived httpOnly cookie bound to the signed-in user, and a PKCE verifier
 * that only this browser holds. A callback that does not carry both attaches
 * nothing, so a link with someone else's authorization code cannot bind their
 * Google account to the victim's Needt.
 */

export const GOOGLE_TASKS_OAUTH_COOKIE_PATH = "/api/task-sync/google";
export const GOOGLE_TASKS_STATE_COOKIE = "needt-tasks-oauth-state-google";
export const GOOGLE_TASKS_VERIFIER_COOKIE = "needt-tasks-oauth-verifier-google";
// RFC 7636 section 4.1: 43-128 unreserved characters.
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

/** Fresh state plus an S256 PKCE pair for one authorization attempt. */
export const createGoogleTasksOAuthSession = createMailOAuthSession;

function cookieOptions() {
  return {
    ...calendarOAuthCookieOptions(),
    path: GOOGLE_TASKS_OAUTH_COOKIE_PATH,
  };
}

export function setGoogleTasksOAuthCookies(
  response: NextResponse,
  userId: string,
  session: { state: string; codeVerifier: string }
) {
  const options = cookieOptions();
  response.cookies.set(
    GOOGLE_TASKS_STATE_COOKIE,
    calendarOAuthStateCookieValue(session.state, userId),
    options
  );
  response.cookies.set(
    GOOGLE_TASKS_VERIFIER_COOKIE,
    session.codeVerifier,
    options
  );
  return response;
}

/** The cookies are single use; the expiry repeats their path or they stay. */
export function clearGoogleTasksOAuthCookies(response: NextResponse) {
  const options = { ...cookieOptions(), maxAge: 0, expires: new Date(0) };
  response.cookies.set(GOOGLE_TASKS_STATE_COOKIE, "", options);
  response.cookies.set(GOOGLE_TASKS_VERIFIER_COOKIE, "", options);
  return response;
}

export type GoogleTasksCallbackCheck =
  | { valid: true; codeVerifier: string }
  | { valid: false };

/** Fails closed: valid only with a matching state cookie and a verifier. */
export function verifyGoogleTasksCallback(
  request: NextRequest,
  userId: string
): GoogleTasksCallbackCheck {
  const stateCookie = request.cookies.get(GOOGLE_TASKS_STATE_COOKIE)?.value;
  const received = request.nextUrl.searchParams.get("state");
  if (!isValidCalendarOAuthState(stateCookie, received, userId)) {
    return { valid: false };
  }
  const codeVerifier = request.cookies.get(GOOGLE_TASKS_VERIFIER_COOKIE)?.value;
  if (!codeVerifier || !CODE_VERIFIER_PATTERN.test(codeVerifier)) {
    return { valid: false };
  }
  return { valid: true, codeVerifier };
}
