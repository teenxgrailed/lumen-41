import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { OpError, getOp, requiredRoleFor, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

const LOG_SOURCE = "connect-ops";

/**
 * Runs one registered operation with the connector token's workspace. The
 * body is the op input. Writes are logged as undoable actions; the response
 * carries the action id for POST /api/agent/actions/:id/undo.
 *
 * The token needs what the op needs, from the same rule `runOp` applies to the
 * workspace role: `needt.read` for a read op, `needt.write` for anything that
 * changes data (and so the write rate limit), plus any extra scope the op
 * names (`mail.read` for mail). An unknown op is authenticated as a read and
 * answered 404 by `runOp`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const op = getOp(name);
  const auth = await authenticateConnectorRequest(
    request,
    op ? requiredRoleFor(op) : WorkspaceRole.VIEWER,
    { extraScopes: op?.scopes }
  );
  if (auth.response) return auth.response;

  try {
    let input: unknown = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        input = JSON.parse(text);
      } catch {
        throw new OpError("INVALID_INPUT", "Body must be JSON");
      }
    }
    const result = await runOp(name, input, {
      userId: auth.userId,
      workspace: auth.workspace,
      actor: "mcp",
    });
    return NextResponse.json(result);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
