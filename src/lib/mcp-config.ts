/**
 * Where the remote MCP server lives and how it is described to OAuth clients.
 * Every value can be overridden from the environment so a staging host or a
 * local check can run the same code; the defaults are production.
 *
 * - The canonical resource is `https://mcp.needt.app/mcp` (RFC 8707 / 9728).
 *   OAuth access tokens are bound to exactly this string.
 * - `https://use.needt.app/api/mcp` keeps answering for clients that send a
 *   personal `needt_` token in a header (`claude mcp add --header`).
 * - The authorization server is the app itself, where the NextAuth session
 *   cookie lives.
 */

/** Scopes a token can carry. Mail is metadata only and needs its own consent. */
export const MCP_SCOPES = ["needt.read", "needt.write", "mail.read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const DEFAULT_RESOURCE = "https://mcp.needt.app/mcp";
const DEFAULT_ISSUER = "https://use.needt.app";

function cleanUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

/** The canonical MCP resource identifier, compared byte for byte. */
export function mcpResource(): string {
  return cleanUrl(process.env.MCP_RESOURCE_URL, DEFAULT_RESOURCE);
}

/** The host that serves only MCP (`mcp.needt.app`). */
export function mcpHost(): string {
  return new URL(mcpResource()).host;
}

/** The OAuth authorization server's issuer (the app's public origin). */
export function oauthIssuer(): string {
  return cleanUrl(
    process.env.OAUTH_ISSUER_URL ?? process.env.NEXTAUTH_URL,
    DEFAULT_ISSUER
  );
}

/**
 * RFC 9728 metadata URL for the canonical resource: the well-known prefix is
 * inserted before the resource's path (`/mcp`).
 */
export function mcpResourceMetadataUrl(): string {
  const resource = new URL(mcpResource());
  const path = resource.pathname === "/" ? "" : resource.pathname;
  return `${resource.origin}/.well-known/oauth-protected-resource${path}`;
}

/** The body of the protected resource metadata document. */
export function mcpResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Needt",
    resource_documentation: `${oauthIssuer()}/docs/connector-api`,
  };
}

/** `WWW-Authenticate` for a request without a usable token. */
export function bearerChallenge(): string {
  return `Bearer resource_metadata="${mcpResourceMetadataUrl()}", scope="${MCP_SCOPES.join(" ")}"`;
}

/** `WWW-Authenticate` for a token that lacks a scope the call needs. */
export function insufficientScopeChallenge(
  required: readonly string[]
): string {
  return `Bearer error="insufficient_scope", scope="${[...new Set([...required, ...MCP_SCOPES])].join(" ")}", resource_metadata="${mcpResourceMetadataUrl()}"`;
}
