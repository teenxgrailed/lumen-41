import { NextRequest, NextResponse } from "next/server";

import { CORS_HEADERS, corsPreflight } from "@/services/oauth/http";
import {
  claimsForScope,
  identityClaims,
  resolveUserinfoToken,
} from "@/services/oauth/oidc";

import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const NO_STORE = { ...CORS_HEADERS, "Cache-Control": "no-store" };

function invalidToken() {
  return NextResponse.json(
    {
      error: "invalid_token",
      error_description: "The access token is missing, expired or revoked.",
    },
    {
      status: 401,
      headers: {
        ...NO_STORE,
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    }
  );
}

/**
 * OpenID Connect UserInfo (§5.3): the same identity claims the id_token
 * carried, for the bearer of an `openid` access token. A token issued for the
 * MCP server is not one.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "oauth-userinfo:ip", 120, 60)],
    { route: "/oauth/userinfo" }
  );
  if (limited) return limited;

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return invalidToken();
  const token = await resolveUserinfoToken(match[1]);
  if (!token) return invalidToken();
  const claims = await identityClaims(token.userId);
  if (!claims) return invalidToken();
  return NextResponse.json(claimsForScope(claims, token.scope), {
    headers: NO_STORE,
  });
}

export async function OPTIONS() {
  return corsPreflight();
}
