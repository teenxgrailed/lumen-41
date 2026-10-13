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

export function formatScopes(scopes: readonly McpScope[]): string {
  return MCP_SCOPES.filter((scope) => scopes.includes(scope)).join(" ");
}
