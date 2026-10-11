import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import type { WorkspaceRole } from "@prisma/client";

import { authSecret } from "@/lib/auth/auth-secret";
import {
  getEmailVerificationStatus,
  requiresEmailVerificationBeforeAccess,
} from "@/lib/auth/email-verification-access";
import {
  isApiSessionCurrent,
  sessionStateAllows,
} from "@/lib/auth/session-version";
import {
  type WorkspaceAccess,
  WorkspaceAuthorizationError,
  requestedWorkspaceId,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "APIAuth";

/**
 * Authenticates a request and returns the user ID if authenticated
 * @param request The NextRequest object
 * @param logSource The source for logging
 * @returns An object with userId if authenticated, or a NextResponse if unauthorized
 */
export async function authenticateRequest(
  request: NextRequest,
  logSource: string,
  options: { requiredRole?: WorkspaceRole } = {}
): Promise<
  | { userId: string; workspace?: WorkspaceAccess; response?: undefined }
  | { response: NextResponse; userId?: undefined; workspace?: undefined }
> {
  // Get the user token from the request
  const token = await getToken({
    req: request,
    secret: authSecret(),
  });

  // If there's no token, return unauthorized
  if (!token) {
    logger.warn("Unauthorized access attempt to API", {}, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  const userId = token.sub;
  if (!userId) {
    logger.warn("No user ID found in token", {}, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  if (!(await isApiSessionCurrent(token))) {
    logger.warn("Revoked session used against API", { userId }, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

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
      requiredRole: options.requiredRole,
    });
    return { userId, workspace };
  } catch (error) {
    if (error instanceof WorkspaceAuthorizationError) {
      logger.warn(
        "Workspace authorization rejected",
        { userId, code: error.code, path: request.nextUrl.pathname },
        logSource
      );
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
 * Middleware to ensure a user is authenticated for API routes
 * @param req The Next.js request object
 * @returns A response if authentication fails, or null if authentication succeeds
 */
export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: authSecret() });

    if (!token?.sub) {
      logger.warn(
        "Unauthenticated API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      select: { isActive: true, sessionVersion: true },
    });
    if (!user || !sessionStateAllows(user, token)) {
      logger.warn(
        "Inactive or missing user attempted API access",
        { userId: token.sub, path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const verification = await getEmailVerificationStatus(token.sub);
    if (verification.required && !verification.verified) {
      return NextResponse.json(
        {
          error: "Confirm your email to continue",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 }
      );
    }

    return null; // Authentication successful
  } catch (error) {
    logger.error(
      "Error in API authentication",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Middleware to ensure a user is an admin for API routes
 * @param req The Next.js request object
 * @returns A response if authorization fails, or null if authorization succeeds
 */
export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: authSecret() });

    if (!token?.sub) {
      logger.warn(
        "Unauthenticated admin API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      select: {
        emailVerified: true,
        isActive: true,
        role: true,
        sessionVersion: true,
      },
    });
    if (!user || !sessionStateAllows(user, token)) {
      logger.warn(
        "Inactive or missing user attempted admin API access",
        { userId: token.sub, path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !user.emailVerified &&
      (await requiresEmailVerificationBeforeAccess())
    ) {
      return NextResponse.json(
        {
          error: "Confirm your email to continue",
          code: "EMAIL_VERIFICATION_REQUIRED",
        },
        { status: 403 }
      );
    }

    if (user.role !== "admin") {
      logger.warn(
        "Non-admin user attempted to access admin API",
        { userId: token.sub, path: req.nextUrl.pathname },
        LOG_SOURCE
      );

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null; // Authorization successful
  } catch (error) {
    logger.error(
      "Error in API admin authorization",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
