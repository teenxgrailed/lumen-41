import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "tasks-spread";

/**
 * Spread tasks over the coming days (`task.spread`): each goes to the first
 * day from today with room for it. The body is the op input (`taskIds` or
 * `scope`); the answer carries `actionId` for
 * POST /api/agent/actions/:id/undo.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const body: unknown = await request.json().catch(() => {
      throw new OpError("INVALID_INPUT", "Body must be JSON");
    });
    const run = await runOp("task.spread", body, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: "user",
    });
    return NextResponse.json(run);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
