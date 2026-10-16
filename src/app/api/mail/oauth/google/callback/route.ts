import { NextRequest, NextResponse } from "next/server";

import { google } from "googleapis";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { canAddMailbox } from "@/lib/entitlements";
import { createGoogleOAuthClient } from "@/lib/google";
import { logger } from "@/lib/logger";
import { createOAuthMailAccount } from "@/lib/mail-db";
import { publicAppUrl } from "@/lib/public-url";
import { enqueueMailSync, ensureMailSyncSchedule } from "@/lib/queue/enqueue";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleMailOAuthCallback";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Google OAuth code is missing.");
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/mail/oauth/google/callback`;
    const oauth2Client = await createGoogleOAuthClient({ redirectUrl });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const profile = await google
      .oauth2({ version: "v2", auth: oauth2Client })
      .userinfo.get();
    if (!profile.data.email || !tokens.access_token) {
      throw new Error("Google mail profile is incomplete.");
    }
    const entitlement = await canAddMailbox(auth.userId, {
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
      auth.userId
    );
    const account = await createOAuthMailAccount({
      userId: auth.userId,
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
