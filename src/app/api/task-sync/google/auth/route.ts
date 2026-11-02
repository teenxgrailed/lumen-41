import { NextRequest, NextResponse } from "next/server";

import type { Auth } from "googleapis";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getGoogleCredentials } from "@/lib/auth";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { createGoogleOAuthClient } from "@/lib/google";
import { GOOGLE_TASKS_CONNECT_SCOPES } from "@/lib/google-oauth-scopes";
import { buildGoogleTasksRedirectUrl } from "@/lib/oauth-redirects";
import {
  createGoogleTasksOAuthSession,
  setGoogleTasksOAuthCookies,
} from "@/lib/task-sync/google-oauth-state";

const LOG_SOURCE = "GoogleTasksOAuthStart";

/**
 * GET /api/task-sync/google/auth
 * Starts the Google Tasks consent. It asks for the Tasks scope on its own
 * (incremental consent): a calendar or mailbox that is already connected keeps
 * its grant through `include_granted_scopes`, and a person who only wants
 * Tasks is never asked for calendar or mail access.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const credentials = await getGoogleCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      return NextResponse.json(
        { error: "Google Tasks isn't available yet." },
        { status: 503 }
      );
    }
    const oauth2Client = await createGoogleOAuthClient({
      redirectUrl: buildGoogleTasksRedirectUrl(),
    });
    const session = createGoogleTasksOAuthSession();
    const response = NextResponse.redirect(
      oauth2Client.generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: [...GOOGLE_TASKS_CONNECT_SCOPES],
        state: session.state,
        code_challenge: session.codeChallenge,
        code_challenge_method: "S256" as Auth.CodeChallengeMethod,
      })
    );
    return setGoogleTasksOAuthCookies(response, auth.userId, session);
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to start Google Tasks OAuth",
      LOG_SOURCE,
      "Could not start Google Tasks connection."
    );
  }
}
