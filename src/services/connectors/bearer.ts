import { NextResponse } from "next/server";

import { resolveAccessToken } from "@/services/oauth/grants";

import {
  MCP_SCOPES,
  type McpScope,
  insufficientScopeChallenge,
} from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

import { hashConnectorToken } from "./auth-tokens";

/**
 * Who a bearer token speaks for. Every route that external tools call — the
 * remote MCP server and the `/api/connect/*` routes it forwards to — reads
 * the caller through `authenticateBearer`, so a token kind added later works
 * everywhere at once.
 *
 * - `personal`: the `needt_…` connector token from Settings › Connectors.
 *   It acts for its owner with every scope and is not tied to a workspace.
 * - `oauth`: an access token issued to an OAuth client
 *   (`src/services/oauth`), with the scopes and the workspace the person
 *   consented to, bound to the canonical MCP resource.
 */
export interface BearerAuth {
  userId: string;
  scopes: McpScope[];
  kind: "personal" | "oauth";
  /** The workspace an OAuth grant is bound to; personal tokens have none. */
  workspaceId?: string;
  /** The OAuth client the token was issued to. */
  clientId?: string;
}

/** A personal connector token can do everything its owner can. */
export const PERSONAL_TOKEN_SCOPES: McpScope[] = [...MCP_SCOPES];

const PERSONAL_PREFIX = "needt_";

/** Resolvers for other token kinds, registered by the module that issues them. */
type BearerResolver = (token: string) => Promise<BearerAuth | null>;
const resolvers: BearerResolver[] = [];

export function registerBearerResolver(resolver: BearerResolver) {
  if (!resolvers.includes(resolver)) resolvers.push(resolver);
}

function bearerToken(authorization: string | null | undefined): string | null {
  const [scheme, token, ...rest] = authorization?.trim().split(/\s+/) ?? [];
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token || rest.length) {
    return null;
  }
  return token;
}

async function personalToken(token: string): Promise<BearerAuth | null> {
  if (!token.startsWith(PERSONAL_PREFIX)) return null;
  const settings = await prisma.connectorSettings.findUnique({
    where: { tokenHash: hashConnectorToken(token) },
    select: { userId: true },
  });
  return settings
    ? {
        userId: settings.userId,
        scopes: [...PERSONAL_TOKEN_SCOPES],
        kind: "personal",
      }
    : null;
}

/** Reads the `Authorization: Bearer …` header of a request, or null. */
export async function authenticateBearer(
  request: Pick<Request, "headers">
): Promise<BearerAuth | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;
  const personal = await personalToken(token);
  if (personal) return personal;
  const oauth = await resolveAccessToken(token);
  if (oauth) return oauth;
  for (const resolve of resolvers) {
    const auth = await resolve(token);
    if (auth) return auth;
  }
  return null;
}

export function hasScopes(auth: BearerAuth, required: readonly McpScope[]) {
  return required.every((scope) => auth.scopes.includes(scope));
}

/** 403 for a valid token that lacks a scope, naming every scope there is. */
export function insufficientScopeResponse(required: readonly McpScope[]) {
  return NextResponse.json(
    {
      error: "insufficient_scope",
      error_description: `This call needs the ${required.join(", ")} scope.`,
      scope: [...new Set([...required, ...MCP_SCOPES])].join(" "),
    },
    {
      status: 403,
      headers: { "WWW-Authenticate": insufficientScopeChallenge(required) },
    }
  );
}
