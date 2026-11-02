import { NextRequest, NextResponse } from "next/server";

import { google } from "googleapis";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { createGoogleOAuthClient } from "@/lib/google";
import { GOOGLE_TASKS_SCOPES } from "@/lib/google-oauth-scopes";
import { logger } from "@/lib/logger";
import { buildGoogleTasksRedirectUrl } from "@/lib/oauth-redirects";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/public-url";
import {
  clearGoogleTasksOAuthCookies,
  verifyGoogleTasksCallback,
} from "@/lib/task-sync/google-oauth-state";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleTasksOAuthCallback";

/** Back to Connections, which reads `googleTasks` and says what happened. */
function connectionsRedirect(request: NextRequest, result: string) {
  const url = publicAppUrl("/connections", request);
  url.searchParams.set("googleTasks", result);
  return NextResponse.redirect(url);
}

/**
 * GET /api/task-sync/google/callback
 * Finishes the Google Tasks consent: stores the tokens on the person's Google
 * account (one row shared with calendar and mail for the same address) and
 * creates the task provider. Connections then offers the lists to import.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  // Nothing below runs, and no account is attached, without a verified state.
  const check = verifyGoogleTasksCallback(request, auth.userId);
  if (!check.valid) {
    await logger.warn(
      "Google Tasks OAuth callback rejected: invalid state",
      { userId: auth.userId },
      LOG_SOURCE
    );
    return clearGoogleTasksOAuthCookies(
      NextResponse.json({ error: "invalid_state" }, { status: 400 })
    );
  }
  const response = await connectGoogleTasks(
    request,
    auth.userId,
    check.codeVerifier
  );
  return clearGoogleTasksOAuthCookies(response);
}

async function connectGoogleTasks(
  request: NextRequest,
  userId: string,
  codeVerifier: string
) {
  try {
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) {
      return connectionsRedirect(
        request,
        providerError === "access_denied" ? "denied" : "failed"
      );
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return connectionsRedirect(request, "failed");

    const oauth2Client = await createGoogleOAuthClient({
      redirectUrl: buildGoogleTasksRedirectUrl(),
    });
    const { tokens } = await oauth2Client.getToken({ code, codeVerifier });
    oauth2Client.setCredentials(tokens);

    // Google's granular consent lets the person untick the Tasks box. Without
    // the scope there is nothing to sync, so say so instead of connecting.
    const granted = (tokens.scope ?? "").split(/\s+/);
    if (!GOOGLE_TASKS_SCOPES.every((scope) => granted.includes(scope))) {
      return connectionsRedirect(request, "scope_missing");
    }

    const profile = await google
      .oauth2({ version: "v2", auth: oauth2Client })
      .userinfo.get();
    if (!profile.data.email || !tokens.access_token) {
      throw new Error("Google account details are incomplete.");
    }

    const accountId = await TokenManager.getInstance().storeTokens(
      "GOOGLE",
      profile.data.email,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: newDate(
          tokens.expiry_date || newDate().getTime() + 3_600_000
        ),
      },
      userId
    );

    // One Google Tasks provider per person. Reconnecting with another Google
    // account drops the old list mappings (their list ids belong to the old
    // account); the tasks already imported stay.
    const existing = await prisma.taskProvider.findFirst({
      where: { userId, type: "GOOGLE" },
      select: { id: true, accountId: true },
    });
    if (existing) {
      if (existing.accountId !== accountId) {
        await prisma.taskListMapping.deleteMany({
          where: { providerId: existing.id },
        });
      }
      await prisma.taskProvider.update({
        where: { id: existing.id },
        data: { accountId, enabled: true, error: null },
      });
    } else {
      await prisma.taskProvider.create({
        data: {
          userId,
          type: "GOOGLE",
          name: "Google Tasks",
          accountId,
          syncEnabled: true,
        },
      });
    }

    return connectionsRedirect(request, "lists");
  } catch (error) {
    await logger.error(
      "Google Tasks OAuth failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return connectionsRedirect(request, "failed");
  }
}
