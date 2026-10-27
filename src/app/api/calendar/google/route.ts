import { NextRequest, NextResponse } from "next/server";

import { GaxiosError } from "gaxios";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  type CalendarProvider,
  calendarProviderNeedsReconnect,
} from "@/lib/calendar-connection-status";
import {
  calendarOAuthStateCookie,
  isValidCalendarOAuthState,
} from "@/lib/calendar-oauth";
import { registerCalendarWebhookBestEffort } from "@/lib/calendar-webhooks/register";
import { newDate } from "@/lib/date-utils";
import { canAddCalendar } from "@/lib/entitlements";
import { createGoogleOAuthClient } from "@/lib/google";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { syncGoogleCalendar } from "@/lib/google-sync";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/public-url";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleCalendarAPI";

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

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const expectedState = request.cookies.get(
      calendarOAuthStateCookie("google")
    )?.value;
    const receivedState = request.nextUrl.searchParams.get("state");
    if (!isValidCalendarOAuthState(expectedState, receivedState, auth.userId)) {
      return settingsRedirect(request, "google", { error: "invalid_state" });
    }
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) {
      return settingsRedirect(request, "google", {
        error:
          providerError === "access_denied"
            ? "consent_denied"
            : "callback_failed",
      });
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return settingsRedirect(request, "google", { error: "missing_code" });
    }
    const entitlement = await canAddCalendar(auth.userId);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: "Calendar limit reached.", entitlement },
        { status: 403 }
      );
    }

    const oauth2Client = await createGoogleOAuthClient({
      redirectUrl: `${process.env.NEXTAUTH_URL}/api/calendar/google`,
    });
    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    if (!userInfo.data.email || !tokens.access_token) {
      return NextResponse.json(
        { error: "Could not retrieve Google account details" },
        { status: 400 }
      );
    }

    const tokenManager = TokenManager.getInstance();
    const accountId = await tokenManager.storeTokens(
      "GOOGLE",
      userInfo.data.email,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: newDate(
          tokens.expiry_date ?? newDate().getTime() + 3_600_000
        ),
      },
      auth.userId
    );

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const feedIds: string[] = [];

    for (const googleCalendar of calendarList.data.items ?? []) {
      if (!googleCalendar.id || !googleCalendar.summary) continue;
      const existingFeed = await prisma.calendarFeed.findFirst({
        where: {
          type: "GOOGLE",
          url: googleCalendar.id,
          accountId,
          userId: auth.userId,
        },
      });
      const feed =
        existingFeed ??
        (await prisma.calendarFeed.create({
          data: {
            id: uuidv4(),
            name: googleCalendar.summary,
            url: googleCalendar.id,
            type: "GOOGLE",
            color: googleCalendar.backgroundColor ?? undefined,
            accountId,
            userId: auth.userId,
          },
        }));
      feedIds.push(feed.id);
    }

    await Promise.all(
      feedIds.map((feedId) =>
        registerCalendarWebhookBestEffort(feedId, "GOOGLE")
      )
    );

    return settingsRedirect(request, "google", { success: "connected" });
  } catch (error) {
    await logger.error(
      "Google Calendar OAuth callback failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return settingsRedirect(request, "google", { error: "callback_failed" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const { accountId, calendarId, name, color } = ((await request
      .json()
      .catch(() => null)) ?? {}) as {
      accountId?: string;
      calendarId?: string;
      name?: string;
      color?: string;
    };
    if (!accountId || !calendarId) {
      return NextResponse.json(
        { error: "Account ID and Calendar ID are required" },
        { status: 400 }
      );
    }

    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId, userId: auth.userId },
    });
    if (!account || account.provider !== "GOOGLE") {
      return NextResponse.json(
        { error: "Invalid Google account" },
        { status: 400 }
      );
    }

    const existingFeed = await prisma.calendarFeed.findFirst({
      where: {
        type: "GOOGLE",
        url: calendarId,
        accountId,
        userId: auth.userId,
      },
    });
    if (existingFeed) return NextResponse.json(existingFeed);

    const calendar = await getGoogleCalendarClient(accountId, auth.userId);
    await calendar.calendars.get({ calendarId });
    const feed = await prisma.calendarFeed.create({
      data: {
        id: uuidv4(),
        name: name || "Google Calendar",
        url: calendarId,
        type: "GOOGLE",
        color,
        accountId,
        userId: auth.userId,
      },
    });

    await syncGoogleCalendar(feed, { forceFullSync: true });
    await registerCalendarWebhookBestEffort(feed.id, "GOOGLE");
    return NextResponse.json(feed);
  } catch (error) {
    await logger.error(
      "Failed to add Google calendar",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    if (
      (error instanceof GaxiosError && Number(error.code) === 401) ||
      calendarProviderNeedsReconnect(error)
    ) {
      return NextResponse.json(
        {
          code: "CALENDAR_REAUTHORIZATION_REQUIRED",
          error: "Google Calendar needs to be reconnected.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const { feedId } = ((await request.json().catch(() => null)) ?? {}) as {
      feedId?: string;
    };
    if (!feedId) {
      return NextResponse.json(
        { error: "Feed ID is required" },
        { status: 400 }
      );
    }

    const feed = await prisma.calendarFeed.findUnique({
      where: { id: feedId, userId: auth.userId },
    });
    if (!feed || feed.type !== "GOOGLE" || !feed.accountId || !feed.url) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const result = await syncGoogleCalendar(feed);
    return NextResponse.json({
      success: true,
      processedEvents: result.processedEventIds.size,
    });
  } catch (error) {
    await logger.error(
      "Failed to sync Google calendar",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    if (
      (error instanceof GaxiosError && Number(error.code) === 401) ||
      calendarProviderNeedsReconnect(error)
    ) {
      return NextResponse.json(
        {
          code: "CALENDAR_REAUTHORIZATION_REQUIRED",
          error: "Google Calendar needs to be reconnected.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
