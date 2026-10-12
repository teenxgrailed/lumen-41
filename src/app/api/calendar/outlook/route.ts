import { NextRequest, NextResponse } from "next/server";

import { getOutlookCredentials } from "@/lib/auth";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { type CalendarProvider } from "@/lib/calendar-connection-status";
import {
  calendarOAuthStateCookie,
  isValidCalendarOAuthState,
} from "@/lib/calendar-oauth";
import { newDate } from "@/lib/date-utils";
import { canAddCalendar } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import {
  MICROSOFT_GRAPH_AUTH_ENDPOINTS,
  resolveOutlookAccountEmail,
} from "@/lib/outlook";
import { OutlookCalendarService } from "@/lib/outlook-calendar";
import { publicAppUrl } from "@/lib/public-url";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "OutlookCalendarAPI";

function settingsRedirect(
  request: NextRequest,
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

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const expectedState = req.cookies.get(
      calendarOAuthStateCookie("outlook")
    )?.value;
    const receivedState = searchParams.get("state");

    if (!isValidCalendarOAuthState(expectedState, receivedState, auth.userId)) {
      return settingsRedirect(req, "outlook", { error: "invalid_state" });
    }

    if (error) {
      logger.error("Outlook auth error:", { error }, LOG_SOURCE);
      return settingsRedirect(req, "outlook", {
        error: error === "access_denied" ? "consent_denied" : "callback_failed",
      });
    }

    if (!code) {
      return settingsRedirect(req, "outlook", { error: "missing_code" });
    }

    const userId = auth.userId;
    const entitlement = await canAddCalendar(userId);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: "Calendar limit reached.", entitlement },
        { status: 403 }
      );
    }

    const { clientId, clientSecret } = await getOutlookCredentials();
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/calendar/outlook`;

    // Exchange code for tokens
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUrl,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch(MICROSOFT_GRAPH_AUTH_ENDPOINTS.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      logger.error(
        "Failed to exchange code for tokens",
        { status: tokenResponse.status },
        LOG_SOURCE
      );
      return settingsRedirect(req, "outlook", { error: "callback_failed" });
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = newDate(Date.now() + tokenData.expires_in * 1000);

    // Create a temporary account to get user info
    const tempAccount = {
      id: "temp",
      provider: "OUTLOOK",
      email: "",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      createdAt: newDate(),
      updatedAt: newDate(),
      caldavUrl: null,
      caldavUsername: null,
      syncOptions: null,
      userId: userId ?? null,
    };

    // Get user info
    const outlookService = new OutlookCalendarService(tempAccount);
    try {
      const userProfile = await outlookService.getUserProfile();
      // Personal Microsoft accounts return `mail: null` from Graph /me and carry
      // the address in `userPrincipalName`; fall back to it so they can connect
      // instead of failing with profile-fetch-failed (issue #97).
      const email = resolveOutlookAccountEmail(userProfile);
      if (!email) {
        logger.error(
          "Failed to get user profile",
          { profile: userProfile?.id ?? "unknown" },
          LOG_SOURCE
        );
        return settingsRedirect(req, "outlook", { error: "callback_failed" });
      }

      // Store tokens
      const tokenManager = TokenManager.getInstance();
      await tokenManager.storeTokens(
        "OUTLOOK",
        email,
        {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
        },
        userId ?? "unknown"
      );

      return settingsRedirect(req, "outlook", { success: "connected" });
    } catch (error) {
      logger.error(
        "Failed to get user profile",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return settingsRedirect(req, "outlook", { error: "callback_failed" });
    }
  } catch (error) {
    logger.error(
      "Failed to connect Outlook account",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return settingsRedirect(req, "outlook", { error: "callback_failed" });
  }
}
