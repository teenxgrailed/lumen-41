import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  calendarOAuthCookieOptions,
  calendarOAuthStateCookie,
  calendarOAuthStateCookieValue,
  calendarSettingsRedirect,
  createCalendarOAuthState,
} from "@/lib/calendar-oauth";
import { canAddCalendar } from "@/lib/entitlements";
import { createGoogleOAuthClient } from "@/lib/google";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-oauth-scopes";
import { logger } from "@/lib/logger";
import { buildCalendarOAuthRedirectUrl } from "@/lib/oauth-redirects";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "GoogleCalendarOAuthStart";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    // A reconnect of an account that already carries calendars is not an
    // addition; the callback judges the exact address.
    const entitlement = await canAddCalendar(auth.userId, {
      provider: "GOOGLE",
    });
    if (!entitlement.allowed) {
      return calendarSettingsRedirect(request, "google", {
        error: "limit_reached",
      });
    }

    const redirectUrl = buildCalendarOAuthRedirectUrl("google");
    const oauth2Client = await createGoogleOAuthClient({ redirectUrl });
    const state = createCalendarOAuthState();

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [...GOOGLE_CALENDAR_SCOPES],
      include_granted_scopes: true,
      prompt: "consent",
      state,
    });

    const response = NextResponse.redirect(url);
    response.cookies.set(
      calendarOAuthStateCookie("google"),
      calendarOAuthStateCookieValue(state, auth.userId),
      calendarOAuthCookieOptions()
    );
    return response;
  } catch (error) {
    await logger.error(
      "Failed to generate Google auth URL",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    const url = publicAppUrl("/settings", request);
    url.searchParams.set("provider", "google");
    url.searchParams.set("calendarError", "callback_failed");
    url.hash = "calendars";
    return NextResponse.redirect(url);
  }
}
