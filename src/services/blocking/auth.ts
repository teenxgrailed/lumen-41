import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { blockingAccess } from "./store";

/**
 * `/api/blocking/*` is read by the web app with its session and by the
 * browser extension, the Mac app and scripts with a personal or OAuth token:
 * a request carrying `Authorization: Bearer` goes the connector way (scope
 * checked), anything else the session way. Then the flag and the plan.
 */
export async function authenticateBlockingRequest(
  request: NextRequest,
  logSource: string,
  role: WorkspaceRole
): Promise<{ userId: string } | { response: NextResponse }> {
  const bearer = request.headers
    .get("authorization")
    ?.toLowerCase()
    .startsWith("bearer ");
  let userId: string;
  if (bearer) {
    const auth = await authenticateConnectorRequest(request, role);
    if ("response" in auth && auth.response) return { response: auth.response };
    userId = auth.userId as string;
  } else {
    const auth = await authenticateRequest(request, logSource, {
      requiredRole: role,
    });
    if ("response" in auth && auth.response) return { response: auth.response };
    userId = auth.userId as string;
  }

  const access = await blockingAccess(userId);
  if (!access.allowed) {
    return {
      response:
        access.reason === "disabled"
          ? NextResponse.json({ error: "Not found" }, { status: 404 })
          : NextResponse.json(
              {
                error: "Focus blocking is part of Pro",
                code: "UPGRADE_REQUIRED",
              },
              { status: 403 }
            ),
    };
  }
  return { userId };
}
