import { NextRequest, NextResponse } from "next/server";

import { resolvePostLogoutTarget } from "@/services/oauth/logout";

import { publicAppUrl } from "@/lib/public-url";

/**
 * OpenID Connect RP-Initiated Logout, as far as Needt offers it:
 * `GET /oauth/logout?client_id=&post_logout_redirect_uri=&state=`.
 *
 * Signing out of NextAuth needs the browser (its sign-out is a POST with a
 * CSRF token, and Needt's offline data is cleared in the page), so this hands
 * the person to a small page that does it and then goes on. Only a
 * post-logout URI registered for the client is passed along; anything else
 * is dropped here, and the page checks again.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const uri = params.get("post_logout_redirect_uri");
  const state = params.get("state");
  const next = publicAppUrl("/oauth/logout/signing-out", request);
  if (
    resolvePostLogoutTarget(clientId, uri, state) !== "/" &&
    clientId &&
    uri
  ) {
    next.searchParams.set("client_id", clientId);
    next.searchParams.set("post_logout_redirect_uri", uri);
    if (state) next.searchParams.set("state", state);
  }
  return NextResponse.redirect(next);
}
