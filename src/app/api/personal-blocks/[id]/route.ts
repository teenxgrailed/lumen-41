import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "personal-blocks-id-route";

type Params = { params: Promise<{ id: string }> };

/** Change a block (`personal.update`). Undo with the returned `actionId`. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const body = (await request.json().catch(() => {
      throw new OpError("INVALID_INPUT", "Body must be JSON");
    })) as Record<string, unknown>;
    const run = await runOp(
      "personal.update",
      { ...body, blockId: id },
      { userId: auth.userId, workspace: auth.workspace!, actor: "user" }
    );
    return NextResponse.json(run);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}

/** Remove a block (`personal.delete`); it is kept, so Undo brings it back. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const run = await runOp(
      "personal.delete",
      { blockId: id },
      { userId: auth.userId, workspace: auth.workspace!, actor: "user" }
    );
    return NextResponse.json(run);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
