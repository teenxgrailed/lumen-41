import type { BearerAuth } from "@/services/connectors/bearer";
import crypto from "crypto";

import { newDate } from "@/lib/date-utils";
import { type McpScope, mcpResource } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_PREFIX,
  AUTHORIZATION_CODE_TTL_MS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  formatScopes,
  parseScopes,
} from "./constants";
import { randomToken, sha256Hex, verifyPkce } from "./crypto";

/** An RFC 6749 §5.2 error the token endpoint answers with. */
export class OAuthError extends Error {
  constructor(
    public readonly error:
      | "invalid_request"
      | "invalid_grant"
      | "invalid_client"
      | "invalid_scope"
      | "invalid_target"
      | "unsupported_grant_type",
    public readonly description: string,
    public readonly status = 400
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** `resource` must be the canonical MCP resource, byte for byte. */
export function checkResource(resource: string | null | undefined) {
  if (resource !== mcpResource()) {
    throw new OAuthError(
      "invalid_target",
      `resource must be ${mcpResource()}.`
    );
  }
}

export async function createAuthorizationCode(input: {
  clientDbId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: McpScope[];
  resource: string;
  workspaceId?: string | null;
}): Promise<string> {
  const code = randomToken(AUTHORIZATION_CODE_PREFIX);
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: sha256Hex(code),
      clientId: input.clientDbId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: formatScopes(input.scopes),
      resource: input.resource,
      workspaceId: input.workspaceId ?? null,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(newDate().getTime() + AUTHORIZATION_CODE_TTL_MS),
    },
  });
  return code;
}

async function issueTokens(input: {
  familyId: string;
  clientDbId: string;
  userId: string;
  scope: string;
  resource: string;
  workspaceId: string | null;
}): Promise<TokenResponse> {
  const now = newDate().getTime();
  const access = randomToken(ACCESS_TOKEN_PREFIX);
  const refresh = randomToken(REFRESH_TOKEN_PREFIX);
  const shared = {
    familyId: input.familyId,
    clientId: input.clientDbId,
    userId: input.userId,
    scope: input.scope,
    resource: input.resource,
    workspaceId: input.workspaceId,
  };
  await prisma.$transaction([
    prisma.oAuthToken.create({
      data: {
        ...shared,
        tokenHash: sha256Hex(access),
        type: "access",
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      },
    }),
    prisma.oAuthToken.create({
      data: {
        ...shared,
        tokenHash: sha256Hex(refresh),
        type: "refresh",
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      },
    }),
    prisma.oAuthClient.update({
      where: { id: input.clientDbId },
      data: { lastUsedAt: newDate() },
    }),
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refresh,
    scope: input.scope,
  };
}

/** Revokes every token of one authorization (a "connected app" grant). */
export function revokeFamily(familyId: string) {
  return prisma.oAuthToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: newDate() },
  });
}

/** grant_type=authorization_code */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientDbId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | null;
}): Promise<TokenResponse> {
  checkResource(input.resource);
  const stored = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: sha256Hex(input.code) },
  });
  if (!stored || stored.clientId !== input.clientDbId) {
    throw new OAuthError("invalid_grant", "Unknown authorization code.");
  }
  // Single use. A second presentation means the code leaked: whatever it
  // already produced is revoked too (OAuth 2.1 §4.1.3).
  const claimed = await prisma.oAuthAuthorizationCode.updateMany({
    where: { id: stored.id, usedAt: null },
    data: { usedAt: newDate() },
  });
  if (claimed.count === 0) {
    await revokeFamily(stored.familyId);
    throw new OAuthError(
      "invalid_grant",
      "The authorization code was already used."
    );
  }
  if (stored.expiresAt.getTime() <= newDate().getTime()) {
    throw new OAuthError("invalid_grant", "The authorization code expired.");
  }
  // Exactly the redirect_uri of the authorization request (a loopback port
  // is free only when matching the registered URIs, not here).
  if (stored.redirectUri !== input.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri does not match.");
  }
  if (!verifyPkce(input.codeVerifier, stored.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed.");
  }
  if (stored.resource !== input.resource) {
    throw new OAuthError(
      "invalid_target",
      "resource differs from the authorization request."
    );
  }
  return issueTokens({
    familyId: stored.familyId,
    clientDbId: stored.clientId,
    userId: stored.userId,
    scope: stored.scope,
    resource: stored.resource,
    workspaceId: stored.workspaceId,
  });
}

/** grant_type=refresh_token, rotating the refresh token within its family. */
export async function refreshTokens(input: {
  refreshToken: string;
  clientDbId: string;
  resource: string | null;
  scope: string | null;
}): Promise<TokenResponse> {
  if (input.resource !== null) checkResource(input.resource);
  const stored = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256Hex(input.refreshToken) },
  });
  if (
    !stored ||
    stored.type !== "refresh" ||
    stored.clientId !== input.clientDbId
  ) {
    throw new OAuthError("invalid_grant", "Unknown refresh token.");
  }
  if (stored.revokedAt) {
    throw new OAuthError("invalid_grant", "The refresh token was revoked.");
  }
  // Rotation: the first use wins. A rotated token presented again means two
  // parties hold it; the whole family is revoked.
  const claimed = await prisma.oAuthToken.updateMany({
    where: { id: stored.id, rotatedAt: null, revokedAt: null },
    data: { rotatedAt: newDate(), lastUsedAt: newDate() },
  });
  if (claimed.count === 0) {
    await revokeFamily(stored.familyId);
    throw new OAuthError(
      "invalid_grant",
      "The refresh token was already used; the connection was revoked."
    );
  }
  if (stored.expiresAt.getTime() <= newDate().getTime()) {
    throw new OAuthError("invalid_grant", "The refresh token expired.");
  }
  let scope = stored.scope;
  if (input.scope !== null) {
    const asked = parseScopes(input.scope);
    const granted = stored.scope.split(" ");
    if (!asked || asked.some((s) => !granted.includes(s))) {
      throw new OAuthError(
        "invalid_scope",
        "A refresh can only narrow the granted scopes."
      );
    }
    scope = formatScopes(asked);
  }
  // The access tokens of the old refresh step stop too.
  await prisma.oAuthToken.updateMany({
    where: { familyId: stored.familyId, type: "access", revokedAt: null },
    data: { revokedAt: newDate() },
  });
  return issueTokens({
    familyId: stored.familyId,
    clientDbId: stored.clientId,
    userId: stored.userId,
    scope,
    resource: stored.resource,
    workspaceId: stored.workspaceId,
  });
}

/**
 * RFC 7009. Revoking either token of a grant ends the whole grant. Unknown
 * tokens are not an error (the endpoint always answers 200).
 */
export async function revokeToken(token: string, clientDbId?: string) {
  const stored = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { familyId: true, clientId: true },
  });
  if (!stored) return false;
  if (clientDbId && stored.clientId !== clientDbId) return false;
  await revokeFamily(stored.familyId);
  return true;
}

/** How often an access token's lastUsedAt is written, at most. */
const LAST_USED_WRITE_MS = 5 * 60 * 1000;

/** The bearer resolver for OAuth access tokens. */
export async function resolveAccessToken(
  token: string
): Promise<BearerAuth | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null;
  const stored = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { client: { select: { clientId: true } } },
  });
  const now = newDate();
  if (
    !stored ||
    stored.type !== "access" ||
    stored.revokedAt ||
    stored.expiresAt.getTime() <= now.getTime() ||
    stored.resource !== mcpResource()
  ) {
    return null;
  }
  if (
    !stored.lastUsedAt ||
    now.getTime() - stored.lastUsedAt.getTime() > LAST_USED_WRITE_MS
  ) {
    await prisma.oAuthToken.update({
      where: { id: stored.id },
      data: { lastUsedAt: now },
    });
  }
  return {
    userId: stored.userId,
    kind: "oauth",
    scopes: (parseScopes(stored.scope) ?? []) as McpScope[],
    clientId: stored.client.clientId,
    ...(stored.workspaceId ? { workspaceId: stored.workspaceId } : {}),
  };
}

/** Settings › Connected apps: one row per live grant. */
export async function listConnectedApps(userId: string) {
  const tokens = await prisma.oAuthToken.findMany({
    where: {
      userId,
      type: "refresh",
      revokedAt: null,
      rotatedAt: null,
      expiresAt: { gt: newDate() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      familyId: true,
      scope: true,
      workspaceId: true,
      createdAt: true,
      client: {
        select: { name: true, clientId: true, kind: true, clientUri: true },
      },
    },
  });
  const lastUsed = await prisma.oAuthToken.groupBy({
    by: ["familyId"],
    where: { familyId: { in: tokens.map((t) => t.familyId) } },
    _max: { lastUsedAt: true },
    _min: { createdAt: true },
  });
  const byFamily = new Map(lastUsed.map((row) => [row.familyId, row]));
  return tokens.map((token) => ({
    id: token.familyId,
    clientName: token.client.name,
    clientUri: token.client.clientUri,
    scopes: token.scope.split(" ").filter(Boolean),
    workspaceId: token.workspaceId,
    connectedAt:
      byFamily.get(token.familyId)?._min.createdAt ?? token.createdAt,
    lastUsedAt: byFamily.get(token.familyId)?._max.lastUsedAt ?? null,
  }));
}

/** Revokes one connected app of this person; false when it is not theirs. */
export async function revokeConnectedApp(userId: string, familyId: string) {
  const owned = await prisma.oAuthToken.findFirst({
    where: { familyId, userId },
    select: { id: true },
  });
  if (!owned) return false;
  await revokeFamily(familyId);
  return true;
}
