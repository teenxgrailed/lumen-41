import { NextRequest, NextResponse } from "next/server";

import { resolveClient } from "@/services/oauth/clients";
import { revokeToken } from "@/services/oauth/grants";
import {
  CORS_HEADERS,
  corsPreflight,
  formBody,
  oauthErrorResponse,
} from "@/services/oauth/http";

import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

/**
 * RFC 7009 revocation. Revoking either token of a grant ends the grant.
 * Answers 200 for unknown tokens too, so it cannot be used to probe them.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "oauth-revoke:ip", 60, 60)],
    { route: "/oauth/revoke" }
  );
  if (limited) return limited;
  const form = await formBody(request);
  const token = form?.get("token");
  if (!form || !token) {
    return oauthErrorResponse("invalid_request", "token is required.");
  }
  const clientId = form.get("client_id");
  const client = clientId
    ? await resolveClient(clientId).catch(() => null)
    : null;
  if (clientId && !client) {
    return oauthErrorResponse("invalid_client", "Unknown client.", 401);
  }
  await revokeToken(token, client?.id);
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return corsPreflight();
}
