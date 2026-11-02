import type { OAuthClient } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import {
  type McpScope,
  isMcpResource,
  mcpResourceAliases,
  oauthIssuer,
} from "@/lib/mcp-config";

import {
  ClientError,
  type ResolveClientOptions,
  resolveClient,
} from "./clients";
import {
  DEFAULT_SCOPES,
  type OidcScope,
  parseOidcScopes,
  parseScopes,
  wantsOpenid,
} from "./constants";
import { isCodeChallenge } from "./crypto";
import { isFirstParty } from "./first-party";
import { createAuthorizationCode } from "./grants";
import { matchesRegisteredRedirect } from "./redirect-uri";

/** A nonce longer than this is not one a client made on purpose. */
const MAX_NONCE_LENGTH = 512;

export interface AuthorizationRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  /** What the client asked for (defaults when it asked for nothing). */
  scopes: (McpScope | OidcScope)[];
  /** The MCP resource; "" for an OpenID Connect request, which has none. */
  resource: string;
  /** Non-null exactly when the scope contains `openid`. */
  oidc: { nonce: string | null } | null;
}

/** The MCP scopes of a request (none for an OpenID Connect one). */
export function mcpScopesOf(request: AuthorizationRequest): McpScope[] {
  return request.oidc ? [] : (request.scopes as McpScope[]);
}

/**
 * The two kinds of failure (OAuth 2.1 §4.1.2.1): before the client and its
 * redirect URI are trusted, nothing may be sent to that URI — the person sees
 * an error page (no open redirect). After, errors go back to the client.
 */
export type AuthorizationResult =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; kind: "page"; error: string; description: string }
  | {
      ok: false;
      kind: "redirect";
      redirectUri: string;
      state: string | null;
      error: string;
      description: string;
    };

export async function validateAuthorizationRequest(
  params: URLSearchParams,
  options: ResolveClientOptions = {}
): Promise<AuthorizationResult> {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (!clientId || !redirectUri) {
    return {
      ok: false,
      kind: "page",
      error: "invalid_request",
      description: "client_id and redirect_uri are required.",
    };
  }
  let client: OAuthClient;
  try {
    client = await resolveClient(clientId, options);
  } catch (error) {
    return {
      ok: false,
      kind: "page",
      error: "invalid_client",
      description:
        error instanceof ClientError ? error.message : "Unknown client.",
    };
  }
  if (!matchesRegisteredRedirect(redirectUri, client.redirectUris)) {
    return {
      ok: false,
      kind: "page",
      error: "invalid_request",
      description: "redirect_uri is not registered for this client.",
    };
  }

  const state = params.get("state");
  const fail = (error: string, description: string): AuthorizationResult => ({
    ok: false,
    kind: "redirect",
    redirectUri,
    state,
    error,
    description,
  });

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type must be code.");
  }
  const codeChallenge = params.get("code_challenge");
  if (
    params.get("code_challenge_method") !== "S256" ||
    !codeChallenge ||
    !isCodeChallenge(codeChallenge)
  ) {
    return fail(
      "invalid_request",
      "PKCE with code_challenge_method=S256 is required."
    );
  }
  const scopeParam = params.get("scope");
  if (wantsOpenid(scopeParam)) {
    // Sign in with a Needt account: Needt's own apps only. No resource, no
    // MCP scopes; the nonce is echoed into the id_token at the token endpoint.
    const oidcScopes = isFirstParty(client)
      ? parseOidcScopes(scopeParam)
      : null;
    if (!oidcScopes) {
      return fail(
        "invalid_scope",
        isFirstParty(client)
          ? "openid can only be combined with email and profile."
          : "openid is not available to this client."
      );
    }
    const nonce = params.get("nonce");
    if (nonce !== null && nonce.length > MAX_NONCE_LENGTH) {
      return fail("invalid_request", "nonce is too long.");
    }
    return {
      ok: true,
      request: {
        client,
        redirectUri,
        state,
        codeChallenge,
        scopes: oidcScopes,
        resource: "",
        oidc: { nonce: nonce || null },
      },
    };
  }
  // A first-party client signs people in and does nothing else.
  if (isFirstParty(client)) {
    return fail("invalid_scope", "This client must ask for the openid scope.");
  }
  // Required (MCP authorization): a token is only ever minted for the
  // resource the client names, and it must be ours.
  const resource = params.get("resource");
  if (!isMcpResource(resource)) {
    return fail(
      "invalid_target",
      `resource must be one of ${mcpResourceAliases().join(", ")}.`
    );
  }
  const asked = parseScopes(scopeParam);
  if (asked === null) {
    return fail("invalid_scope", "Unknown scope requested.");
  }
  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state,
      codeChallenge,
      scopes: asked.length ? asked : [...DEFAULT_SCOPES],
      resource: resource as string,
      oidc: null,
    },
  };
}

/**
 * A first-party client needs no consent: once the person is signed in, the
 * code is issued at once and this is where they are sent back to the client.
 * `auth_time` is the moment of this authorization (the session does not carry
 * the moment of the original sign-in).
 */
export async function completeFirstPartyAuthorization(
  request: AuthorizationRequest,
  userId: string
): Promise<string> {
  const code = await createAuthorizationCode({
    clientDbId: request.client.id,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scopes: request.scopes,
    resource: request.resource,
    nonce: request.oidc?.nonce ?? null,
    authTime: newDate(),
  });
  return clientRedirect(request.redirectUri, { code, state: request.state });
}

/** The redirect back to the client, always carrying `iss` (RFC 9207). */
export function clientRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", oauthIssuer());
  return url.toString();
}
