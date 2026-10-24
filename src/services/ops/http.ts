import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

import { OpError } from "./errors";
import type { OpActor } from "./types";

/** JSON response for an op failure; anything that is not an OpError is a 500. */
export function opErrorResponse(error: unknown, logSource: string) {
  if (error instanceof OpError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status }
    );
  }
  logger.error(
    "Op request failed",
    { error: error instanceof Error ? error.message : String(error) },
    logSource
  );
  return NextResponse.json(
    { error: "Internal Server Error", code: "INTERNAL" },
    { status: 500 }
  );
}

/**
 * Accepts either a `needt_` connector bearer token (external tools) or the
 * signed-in session. The workspace is resolved at VIEWER; each op and undo
 * enforces the role it needs. `write` marks a call that changes data (an
 * undo): a bearer token then needs `needt.write`, not just read access.
 */
export async function authenticateAgentRequest(
  request: NextRequest,
  logSource: string,
  options: { write?: boolean } = {}
) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const auth = await authenticateConnectorRequest(
      request,
      WorkspaceRole.VIEWER,
      { write: options.write }
    );
    if (auth.response) return { response: auth.response };
    return {
      userId: auth.userId,
      workspace: auth.workspace,
      actor: "mcp" as OpActor,
    };
  }
  const auth = await authenticateRequest(request, logSource, {
    requiredRole: WorkspaceRole.VIEWER,
  });
  if (auth.response) return { response: auth.response };
  return {
    userId: auth.userId,
    workspace: auth.workspace,
    actor: "user" as OpActor,
  };
}
