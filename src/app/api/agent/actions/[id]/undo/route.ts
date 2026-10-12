import { NextRequest, NextResponse } from "next/server";

import { undoAction } from "@/services/ops";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

const LOG_SOURCE = "agent-action-undo";

/**
 * Undo one applied action. 200 with `status: "undone"` on success, 409 with
 * the conflicting rows when something changed after the action. Another
 * user's action is a 404.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    const result = await undoAction(id, auth.userId, auth.actor);
    return NextResponse.json(result, {
      status:
        result.status === "undo_conflict"
          ? 409
          : result.status === "not_undoable"
            ? 422
            : 200,
    });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
