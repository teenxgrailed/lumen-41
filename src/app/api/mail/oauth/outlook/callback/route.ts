import { NextRequest, NextResponse } from "next/server";

import { getOutlookCredentials } from "@/lib/auth";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { canAddMailbox } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { createOAuthMailAccount } from "@/lib/mail-db";
import {
  MICROSOFT_GRAPH_API_BASE,
  MICROSOFT_GRAPH_AUTH_ENDPOINTS,
  MSGraphUser,
  resolveOutlookAccountEmail,
} from "@/lib/outlook";
import { publicAppUrl } from "@/lib/public-url";
import { enqueueMailSync, ensureMailSyncSchedule } from "@/lib/queue/enqueue";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "OutlookMailOAuthCallback";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Outlook OAuth code is missing.");
    const { clientId, clientSecret } = await getOutlookCredentials();
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/mail/oauth/outlook/callback`;
    const tokenResponse = await fetch(MICROSOFT_GRAPH_AUTH_ENDPOINTS.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUrl,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("Outlook token exchange failed.");
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const profileResponse = await fetch(`${MICROSOFT_GRAPH_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("Outlook profile fetch failed.");
    const address = resolveOutlookAccountEmail(
      (await profileResponse.json()) as MSGraphUser
    );
    if (!address) throw new Error("Outlook email address is unavailable.");
    const entitlement = await canAddMailbox(auth.userId, {
      provider: "OUTLOOK",
      address,
    });
    if (!entitlement.allowed) {
      return NextResponse.redirect(
        publicAppUrl("/mail?error=mailbox-limit", request)
      );
    }
    const connectionRef = await TokenManager.getInstance().storeTokens(
      "OUTLOOK",
      address,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: newDate(newDate().getTime() + tokens.expires_in * 1_000),
      },
      auth.userId
    );
    const account = await createOAuthMailAccount({
      userId: auth.userId,
      provider: "OUTLOOK",
      address,
      connectionRef,
    });
    await ensureMailSyncSchedule(account.id);
    await enqueueMailSync(account.id);
    return NextResponse.redirect(
      publicAppUrl("/mail?connected=outlook", request)
    );
  } catch (error) {
    await logger.error(
      "Outlook mail OAuth failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.redirect(publicAppUrl("/mail?error=outlook", request));
  }
}
