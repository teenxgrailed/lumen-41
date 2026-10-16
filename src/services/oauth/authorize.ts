import type { OAuthClient } from "@prisma/client";

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
import { DEFAULT_SCOPES, parseScopes } from "./constants";
import { isCodeChallenge } from "./crypto";
import { matchesRegisteredRedirect } from "./redirect-uri";

export interface AuthorizationRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  /** What the client asked for (defaults when it asked for nothing). */
  scopes: McpScope[];
  resource: string;
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
  // Required (MCP authorization): a token is only ever minted for the
  // resource the client names, and it must be ours.
  const resource = params.get("resource");
  if (!isMcpResource(resource)) {
    return fail(
      "invalid_target",
      `resource must be one of ${mcpResourceAliases().join(", ")}.`
    );
  }
  const asked = parseScopes(params.get("scope"));
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
    },
  };
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
