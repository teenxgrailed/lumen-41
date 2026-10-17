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

/**
 * Every URL that names the one protected resource: the canonical identifier
 * plus the older `<NEXTAUTH_URL origin>/api/mcp` that people already added as
 * a connector. Tokens issued for either work at both endpoints. Metadata and
 * challenges only ever advertise the canonical one.
 */
export function mcpResourceAliases(): string[] {
  const appOrigin = new URL(cleanUrl(process.env.NEXTAUTH_URL, DEFAULT_ISSUER))
    .origin;
  return Array.from(new Set([mcpResource(), `${appOrigin}/api/mcp`]));
}

/** Whether `resource` is the canonical resource or an alias of it, exactly. */
export function isMcpResource(resource: string | null | undefined): boolean {
  return (
    typeof resource === "string" && mcpResourceAliases().includes(resource)
  );
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

/** What a client is asked for by default: mail needs its own reason. */
const CHALLENGE_SCOPES: McpScope[] = ["needt.read", "needt.write"];

/** The challenge's scope list: the defaults plus what this call needs. */
export function challengeScope(required: readonly string[] = []): string {
  const wanted = new Set<string>([...CHALLENGE_SCOPES, ...required]);
  return MCP_SCOPES.filter((scope) => wanted.has(scope)).join(" ");
}

/** `WWW-Authenticate` for a request without a usable token. */
export function bearerChallenge(): string {
  return `Bearer resource_metadata="${mcpResourceMetadataUrl()}", scope="${challengeScope()}"`;
}

/**
 * `WWW-Authenticate` for a token that lacks a scope the call needs. mail.read
 * is only asked for when the call is about mail.
 */
export function insufficientScopeChallenge(
  required: readonly string[]
): string {
  return `Bearer error="insufficient_scope", scope="${challengeScope(required)}", resource_metadata="${mcpResourceMetadataUrl()}"`;
}
