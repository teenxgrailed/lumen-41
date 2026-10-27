import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import {
  clientRedirect,
  validateAuthorizationRequest,
} from "@/services/oauth/authorize";
import {
  AUTHORIZE_PARAMS,
  consentWorkspaces,
  grantedScopes,
} from "@/services/oauth/consent";
import { createAuthorizationCode } from "@/services/oauth/grants";
import {
  DECISION_LIMIT_PER_MINUTE,
  cimdFetchGuard,
  limitAuthorize,
} from "@/services/oauth/limits";

import { isAdminUserId } from "@/lib/auth/admin-role";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { publicAppUrl } from "@/lib/public-url";
import { requestIp } from "@/lib/security/rate-limit";

function page(status: number, message: string) {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * The consent form's answer. Same-origin only (the form is a plain POST,
 * so the Origin check is the CSRF defence, next to SameSite cookies); the
 * whole request is validated again, never trusted from the first render.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== publicAppUrl("/", request).origin) {
    return page(403, "This form can only be sent from Needt.");
  }
  const ip = requestIp(request);
  const limited = await limitAuthorize(
    ip,
    "/oauth/authorize/decision",
    DECISION_LIMIT_PER_MINUTE
  );
  if (limited) return limited;
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) return page(401, "Sign in again and retry.");

  const form = await request.formData();
  const params = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    const value = form.get(key);
    if (typeof value === "string") params.set(key, value);
  }
  const result = await validateAuthorizationRequest(params, {
    allowFetch: cimdFetchGuard(ip, "/oauth/authorize/decision"),
  });
  if (!result.ok) {
    return result.kind === "page"
      ? page(400, result.description)
      : NextResponse.redirect(
          clientRedirect(result.redirectUri, {
            error: result.error,
            error_description: result.description,
            state: result.state,
          }),
          303
        );
  }
  const { request: authz } = result;

  if (form.get("decision") !== "allow") {
    return NextResponse.redirect(
      clientRedirect(authz.redirectUri, {
        error: "access_denied",
        error_description: "The person declined.",
        state: authz.state,
      }),
      303
    );
  }

  const wantsAdmin = form.get("admin") === "on";
  const scopes = grantedScopes(
    authz.scopes,
    {
      write: form.get("write") === "on",
      mail: form.get("mail") === "on",
      admin: wantsAdmin,
    },
    // The role is read again here, never trusted from the rendered form.
    { isAdmin: wantsAdmin && (await isAdminUserId(userId)) }
  );
  if (!scopes.length) {
    return NextResponse.redirect(
      clientRedirect(authz.redirectUri, {
        error: "access_denied",
        error_description: "No access was granted.",
        state: authz.state,
      }),
      303
    );
  }

  const workspaceId = form.get("workspaceId");
  const workspaces = await consentWorkspaces(userId);
  const chosen = workspaces.find((w) => w.workspace.id === workspaceId);
  if (!chosen) return page(400, "Pick one of your workspaces.");

  const code = await createAuthorizationCode({
    clientDbId: authz.client.id,
    userId,
    redirectUri: authz.redirectUri,
    codeChallenge: authz.codeChallenge,
    scopes,
    resource: authz.resource,
    workspaceId: chosen.workspace.id,
  });
  return NextResponse.redirect(
    clientRedirect(authz.redirectUri, { code, state: authz.state }),
    303
  );
}
