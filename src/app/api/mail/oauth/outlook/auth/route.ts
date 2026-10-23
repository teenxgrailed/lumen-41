import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getOutlookCredentials } from "@/lib/auth";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { canAddMailbox } from "@/lib/entitlements";
import {
  createMailOAuthSession,
  setMailOAuthCookies,
} from "@/lib/mail/oauth-state";
import { OUTLOOK_MAIL_OAUTH_SCOPES } from "@/lib/mail/scopes";
import { MICROSOFT_GRAPH_AUTH_ENDPOINTS } from "@/lib/outlook";

const LOG_SOURCE = "OutlookMailOAuthStart";

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
    const { clientId, clientSecret } = await getOutlookCredentials();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Outlook Mail isn't available yet." },
        { status: 503 }
      );
    }
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/mail/oauth/outlook/callback`;
    const session = createMailOAuthSession();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUrl,
      response_mode: "query",
      prompt: "consent",
      scope: OUTLOOK_MAIL_OAUTH_SCOPES.join(" "),
      state: session.state,
      code_challenge: session.codeChallenge,
      code_challenge_method: "S256",
    });
    const response = NextResponse.redirect(
      `${MICROSOFT_GRAPH_AUTH_ENDPOINTS.auth}?${params}`
    );
    return setMailOAuthCookies(response, "outlook", auth.userId, session);
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to start Outlook Mail OAuth",
      LOG_SOURCE,
      "Could not start Outlook Mail connection."
    );
  }
}
