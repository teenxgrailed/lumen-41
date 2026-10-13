import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import {
  type WorkspaceAccess,
  WorkspaceAuthorizationError,
  requestedWorkspaceId,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { bearerChallenge } from "@/lib/mcp-config";
import type { McpScope } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

import {
  type BearerAuth,
  authenticateBearer,
  hasScopes,
  insufficientScopeResponse,
} from "./bearer";

export { generateConnectorToken, hashConnectorToken } from "./auth-tokens";

/**
 * Invalidates the user's connector token (the `needt_…` bearer external tools
 * use). The webhook settings stay; the person generates a new token and
 * reconnects their tools. Returned unawaited so it can join a transaction.
 */
export function revokeConnectorTokens(userId: string) {
  return prisma.connectorSettings.updateMany({
    where: { userId, tokenHash: { not: null } },
    data: { tokenHash: null, tokenPreview: null },
  });
}

export async function ensureConnectorSettings(userId: string) {
  return prisma.connectorSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/** The user behind an `Authorization` header, or null (any token kind). */
export async function authenticateConnectorToken(authHeader: string | null) {
  const auth = await authenticateBearer({
    headers: new Headers(authHeader ? { authorization: authHeader } : {}),
  });
  return auth?.userId ?? null;
}

/** The scope a workspace role needs: reading needs read, anything else write. */
export function scopeForRole(role: WorkspaceRole): McpScope {
  return role === WorkspaceRole.VIEWER ? "needt.read" : "needt.write";
}

/**
 * Resolves the workspace a connector call acts in. An OAuth grant is bound to
 * the workspace the person picked at consent: asking for another one is
 * refused, and asking for none means that one. Otherwise the
 * `X-Workspace-Id` header, `?workspaceId=`, or `workspaceId` (an MCP
 * tool argument, for clients that cannot send headers) picks it.
 */
export async function authorizeConnectorWorkspace(
  request: NextRequest,
  userId: string,
  requiredRole: WorkspaceRole,
  options: { workspaceId?: string; boundWorkspaceId?: string } = {}
): Promise<
  | { userId: string; workspace: WorkspaceAccess; response?: undefined }
  | { response: NextResponse; userId?: undefined; workspace?: undefined }
> {
  try {
    const verification = await getEmailVerificationStatus(userId);
    if (verification.required && !verification.verified) {
      return {
        response: NextResponse.json(
          {
            error: "Confirm your email to continue",
            code: "EMAIL_VERIFICATION_REQUIRED",
          },
          { status: 403 }
        ),
      };
    }
    const fromRequest = requestedWorkspaceId(request);
    const asked = options.workspaceId?.trim() || undefined;
    if (fromRequest && asked && fromRequest !== asked) {
      throw new WorkspaceAuthorizationError(
        "Conflicting workspace identifiers.",
        400,
        "INVALID_WORKSPACE_REQUEST"
      );
    }
    const wanted = asked ?? fromRequest;
    if (
      options.boundWorkspaceId &&
      wanted &&
      wanted !== options.boundWorkspaceId
    ) {
      throw new WorkspaceAuthorizationError(
        "This connection is limited to another workspace.",
        403,
        "WORKSPACE_ACCESS_DENIED"
      );
    }
    const workspace = await resolveWorkspaceAccess({
      userId,
      requestedWorkspaceId: options.boundWorkspaceId ?? wanted,
      requiredRole,
    });
    return { userId, workspace };
  } catch (error) {
    if (error instanceof WorkspaceAuthorizationError) {
      return {
        response: NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status }
        ),
      };
    }
    throw error;
  }
}

/**
 * Authenticates a `/api/connect/*` call with any bearer kind, checks the
 * scope its role needs, and resolves the workspace (bound for OAuth).
 */
export async function authenticateConnectorRequest(
  request: NextRequest,
  requiredRole: WorkspaceRole
): Promise<
  | {
      userId: string;
      workspace: WorkspaceAccess;
      bearer: BearerAuth;
      response?: undefined;
    }
  | { response: NextResponse; userId?: undefined; workspace?: undefined }
> {
  const bearer = await authenticateBearer(request);
  if (!bearer) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "WWW-Authenticate": bearerChallenge() } }
      ),
    };
  }
  const scope = scopeForRole(requiredRole);
  if (!hasScopes(bearer, [scope])) {
    return { response: insufficientScopeResponse([scope]) };
  }
  const auth = await authorizeConnectorWorkspace(
    request,
    bearer.userId,
    requiredRole,
    { boundWorkspaceId: bearer.workspaceId }
  );
  if (auth.response) return { response: auth.response };
  return { userId: auth.userId, workspace: auth.workspace, bearer };
}
