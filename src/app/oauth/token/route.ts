import { NextRequest, NextResponse } from "next/server";

import { ClientError, resolveClient } from "@/services/oauth/clients";
import {
  OAuthError,
  exchangeAuthorizationCode,
  refreshTokens,
} from "@/services/oauth/grants";
import {
  CORS_HEADERS,
  corsPreflight,
  formBody,
  oauthErrorResponse,
} from "@/services/oauth/http";
import { cimdFetchGuard } from "@/services/oauth/limits";

import { logger } from "@/lib/logger";
import {
  enforceRateLimits,
  ipRule,
  requestIp,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "OAuthToken";

/**
 * Token endpoint (OAuth 2.1): authorization_code with PKCE S256, and
 * refresh_token with rotation. Public clients only; the client is named by
 * client_id. `resource` must be the canonical MCP resource.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "oauth-token:ip", 120, 60)],
    { route: "/oauth/token" }
  );
  if (limited) return limited;

  const form = await formBody(request);
  if (!form) {
    return oauthErrorResponse(
      "invalid_request",
      "Send application/x-www-form-urlencoded."
    );
  }
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (!clientId) {
    return oauthErrorResponse("invalid_client", "client_id is required.", 401);
  }
  try {
    const client = await resolveClient(clientId, {
      allowFetch: cimdFetchGuard(requestIp(request), "/oauth/token"),
    });
    const tokens =
      grantType === "authorization_code"
        ? await exchangeAuthorizationCode({
            code: form.get("code") ?? "",
            clientDbId: client.id,
            redirectUri: form.get("redirect_uri") ?? "",
            codeVerifier: form.get("code_verifier") ?? "",
            resource: form.get("resource"),
          })
        : grantType === "refresh_token"
          ? await refreshTokens({
              refreshToken: form.get("refresh_token") ?? "",
              clientDbId: client.id,
              resource: form.get("resource"),
              scope: form.get("scope"),
            })
          : null;
    if (!tokens) {
      return oauthErrorResponse(
        "unsupported_grant_type",
        "grant_type must be authorization_code or refresh_token."
      );
    }
    return NextResponse.json(tokens, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthErrorResponse(error.error, error.description, error.status);
    }
    if (error instanceof ClientError) {
      return oauthErrorResponse("invalid_client", error.message, 401);
    }
    await logger.error(
      "Token endpoint failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return oauthErrorResponse("server_error", "Try again later.", 500);
  }
}

export async function OPTIONS() {
  return corsPreflight();
}
