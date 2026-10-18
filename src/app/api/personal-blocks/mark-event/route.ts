import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "personal-blocks-mark-event";

/**
 * Mark a calendar event (synced or local) as personal time
 * (`personal.mark_event`). Needt keeps a block linked to the event; nothing is
 * written to the provider.
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
    const run = await runOp("personal.mark_event", body, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: "user",
    });
    return NextResponse.json(run);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
