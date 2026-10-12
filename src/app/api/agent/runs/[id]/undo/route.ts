import { NextRequest, NextResponse } from "next/server";

import { undoRun } from "@/services/ops";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

const LOG_SOURCE = "agent-run-undo";

/**
 * Undo every action of a run, newest first. Stops at the first conflict and
 * returns 409 with what was undone, the conflict, and what was left applied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    const result = await undoRun(id, auth.userId, auth.actor);
    return NextResponse.json(result, {
      status: result.status === "partial" ? 409 : 200,
    });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
