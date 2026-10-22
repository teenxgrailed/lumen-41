import { NextRequest, NextResponse } from "next/server";

import { google } from "googleapis";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { canAddMailbox } from "@/lib/entitlements";
import { createGoogleOAuthClient } from "@/lib/google";
import { logger } from "@/lib/logger";
import { createOAuthMailAccount } from "@/lib/mail-db";
import {
  clearMailOAuthCookies,
  invalidMailOAuthStateResponse,
  verifyMailOAuthCallback,
} from "@/lib/mail/oauth-state";
import { publicAppUrl } from "@/lib/public-url";
import { enqueueMailSync, ensureMailSyncSchedule } from "@/lib/queue/enqueue";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleMailOAuthCallback";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  // Nothing below runs, and no mailbox is attached, without a verified state.
  const check = verifyMailOAuthCallback(request, "google", auth.userId);
  if (!check.valid) {
    await logger.warn(
      "Google mail OAuth callback rejected: invalid state",
      { userId: auth.userId },
      LOG_SOURCE
    );
    return invalidMailOAuthStateResponse("google");
  }
  const response = await connectGoogleMailbox(
    request,
    auth.userId,
    check.codeVerifier
  );
  return clearMailOAuthCookies(response, "google");
}

async function connectGoogleMailbox(
  request: NextRequest,
  userId: string,
  codeVerifier: string
) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Google OAuth code is missing.");
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/mail/oauth/google/callback`;
    const oauth2Client = await createGoogleOAuthClient({ redirectUrl });
    const { tokens } = await oauth2Client.getToken({ code, codeVerifier });
    oauth2Client.setCredentials(tokens);
    const profile = await google
      .oauth2({ version: "v2", auth: oauth2Client })
      .userinfo.get();
    if (!profile.data.email || !tokens.access_token) {
      throw new Error("Google mail profile is incomplete.");
    }
    const entitlement = await canAddMailbox(userId, {
      provider: "GMAIL",
      address: profile.data.email,
    });
    if (!entitlement.allowed) {
      return NextResponse.redirect(
        publicAppUrl("/mail?error=mailbox-limit", request)
      );
    }
    const connectionRef = await TokenManager.getInstance().storeTokens(
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
    const account = await createOAuthMailAccount({
      userId,
      provider: "GMAIL",
      address: profile.data.email,
      connectionRef,
    });
    await ensureMailSyncSchedule(account.id);
    await enqueueMailSync(account.id);
    return NextResponse.redirect(
      publicAppUrl("/mail?connected=gmail", request)
    );
  } catch (error) {
    await logger.error(
      "Google mail OAuth failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.redirect(publicAppUrl("/mail?error=google", request));
  }
}
