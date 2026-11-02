import { MCP_SCOPES, type McpScope } from "@/lib/mcp-config";

/** Token and code prefixes: a glance tells a leaked string's kind. */
export const ACCESS_TOKEN_PREFIX = "ndt_oat_";
export const REFRESH_TOKEN_PREFIX = "ndt_ort_";
export const AUTHORIZATION_CODE_PREFIX = "ndt_oac_";

export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A dynamically registered client nobody finished connecting is removed. */
export const UNUSED_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** What a client gets when it asks for no scope: read and write, no mail. */
export const DEFAULT_SCOPES: McpScope[] = ["needt.read", "needt.write"];

export function parseScopes(raw: string | null | undefined): McpScope[] | null {
  if (!raw?.trim()) return [];
  const asked = [...new Set(raw.trim().split(/\s+/))];
  return asked.every((scope) =>
    (MCP_SCOPES as readonly string[]).includes(scope)
  )
    ? (asked as McpScope[])
    : null;
}

export function formatScopes(scopes: readonly string[]): string {
  return [...OIDC_SCOPES, ...MCP_SCOPES]
    .filter((scope) => scopes.includes(scope))
    .join(" ");
}

/** OpenID Connect scopes: only first-party clients may ask for them. */
export const OIDC_SCOPES = ["openid", "email", "profile"] as const;
export type OidcScope = (typeof OIDC_SCOPES)[number];

/** Whether a scope parameter names `openid` (the switch into OIDC). */
export function wantsOpenid(raw: string | null | undefined): boolean {
  return !!raw && raw.trim().split(/\s+/).includes("openid");
}

/**
 * An OIDC scope parameter: `openid`, optionally with `email` and `profile`.
 * null when it names anything else (MCP scopes do not mix with openid) or
 * does not name `openid`.
 */
export function parseOidcScopes(
  raw: string | null | undefined
): OidcScope[] | null {
  if (!wantsOpenid(raw)) return null;
  const asked = [...new Set((raw as string).trim().split(/\s+/))];
  return asked.every((scope) =>
    (OIDC_SCOPES as readonly string[]).includes(scope)
  )
    ? (asked as OidcScope[])
    : null;
}
