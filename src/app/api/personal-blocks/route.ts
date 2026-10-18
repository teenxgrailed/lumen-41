import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "personal-blocks-route";

/**
 * Personal time (Lunch, Walk, Gym...): blocks the person keeps for themselves,
 * where tasks are never scheduled. GET lists them and, with `from` and `to`,
 * every occurrence in that range. POST creates one (the `personal.create` op;
 * the answer carries `actionId` for POST /api/agent/actions/:id/undo).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const params = request.nextUrl.searchParams;
  try {
    const run = await runOp(
      "personal.list",
      {
        ...(params.get("from") ? { from: params.get("from") } : {}),
        ...(params.get("to") ? { to: params.get("to") } : {}),
        ...(params.get("includeArchived") === "true"
          ? { includeArchived: true }
          : {}),
      },
      { userId: auth.userId, workspace: auth.workspace!, actor: "user" }
    );
    return NextResponse.json(run.result);
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const body: unknown = await request.json().catch(() => {
      throw new OpError("INVALID_INPUT", "Body must be JSON");
    });
    const run = await runOp("personal.create", body, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: "user",
    });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
