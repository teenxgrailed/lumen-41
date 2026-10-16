import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getGoogleCredentials } from "@/lib/auth";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { canAddMailbox } from "@/lib/entitlements";
import { createGoogleOAuthClient } from "@/lib/google";
import { GMAIL_OAUTH_SCOPES } from "@/lib/mail/scopes";

const LOG_SOURCE = "GoogleMailOAuthStart";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const entitlement = await canAddMailbox(auth.userId);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: "Mailbox limit reached.", entitlement },
        { status: 403 }
      );
    }
    const credentials = await getGoogleCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      return NextResponse.json(
        { error: "Gmail isn't available yet." },
        { status: 503 }
      );
    }
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/mail/oauth/google/callback`;
    const oauth2Client = await createGoogleOAuthClient({ redirectUrl });
    return NextResponse.redirect(
      oauth2Client.generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: [...GMAIL_OAUTH_SCOPES],
      })
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to start Google Mail OAuth",
      LOG_SOURCE,
      "Could not start Google Mail connection."
    );
  }
}
