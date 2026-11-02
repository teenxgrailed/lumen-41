import { NextResponse } from "next/server";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { publicAppUrl } from "@/lib/public-url";

export type CalendarProvider = "google" | "outlook";

const STATE_COOKIE_PREFIX = "needt-calendar-oauth-state";

export function calendarOAuthStateCookie(provider: CalendarProvider) {
  return `${STATE_COOKIE_PREFIX}-${provider}`;
}

export function createCalendarOAuthState() {
  return randomBytes(32).toString("hex");
}

function calendarOAuthUserBinding(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}

export function calendarOAuthStateCookieValue(state: string, userId: string) {
  return `${state}.${calendarOAuthUserBinding(userId)}`;
}

export function isValidCalendarOAuthState(
  expectedCookie: string | undefined,
  received: string | null,
  userId: string
) {
  if (!expectedCookie || !received) return false;
  const [expected, expectedUserBinding, ...extra] = expectedCookie.split(".");
  if (!expected || !expectedUserBinding || extra.length > 0) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  const expectedUserBuffer = Buffer.from(expectedUserBinding);
  const receivedUserBuffer = Buffer.from(calendarOAuthUserBinding(userId));
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer) &&
    expectedUserBuffer.length === receivedUserBuffer.length &&
    timingSafeEqual(expectedUserBuffer, receivedUserBuffer)
  );
}

export function calendarOAuthCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/calendar",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * Back to Settings > Calendars with the outcome in the query string, clearing
 * the OAuth state cookie. Every calendar connect branch ends here, so a person
 * never lands on a bare JSON page mid-redirect.
 */
export function calendarSettingsRedirect(
  request: Parameters<typeof publicAppUrl>[1],
  provider: CalendarProvider,
  result: { error?: string; success?: string }
) {
  const url = publicAppUrl("/settings", request);
  url.searchParams.set("provider", provider);
  if (result.error) url.searchParams.set("calendarError", result.error);
  if (result.success) url.searchParams.set("calendarSuccess", result.success);
  url.hash = "calendars";
  const response = NextResponse.redirect(url);
  response.cookies.delete(calendarOAuthStateCookie(provider));
  return response;
}
