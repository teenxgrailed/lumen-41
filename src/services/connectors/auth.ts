import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";
import crypto from "crypto";

import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import {
  type WorkspaceAccess,
  WorkspaceAuthorizationError,
  requestedWorkspaceId,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

export function generateConnectorToken() {
  return `needt_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashConnectorToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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

export async function authenticateConnectorToken(authHeader: string | null) {
  const [scheme, token] = authHeader?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  const settings = await prisma.connectorSettings.findUnique({
    where: { tokenHash: hashConnectorToken(token) },
  });

  return settings?.userId ?? null;
}

export async function authorizeConnectorWorkspace(
  request: NextRequest,
  userId: string,
  requiredRole: WorkspaceRole
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
    const workspace = await resolveWorkspaceAccess({
      userId,
      requestedWorkspaceId: requestedWorkspaceId(request),
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

export async function authenticateConnectorRequest(
  request: NextRequest,
  requiredRole: WorkspaceRole
) {
  const userId = await authenticateConnectorToken(
    request.headers.get("authorization")
  );
  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return authorizeConnectorWorkspace(request, userId, requiredRole);
}
