import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "personal-blocks-defaults";

/**
 * Repeating defaults (Settings → Your day): `{ kind, enabled, at, minutes,
 * days }` runs `personal.set_default`. One default per kind.
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
    const run = await runOp("personal.set_default", body, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: "user",
    });
    return NextResponse.json(run);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
