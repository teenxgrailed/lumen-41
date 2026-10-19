import { NextRequest, NextResponse } from "next/server";

import { runOp } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";
import {
  type StarterCreateResult,
  starterCreateSchema,
} from "@/lib/starter-game";

const LOG_SOURCE = "starter-game-create";

/**
 * POST { tasks, habits, projects } -> { result, actionId, undoable }
 * Creates what the person sorted in one transaction and one AgentAction:
 * tasks for today or this week (with due dates), habits (with a weekly
 * cadence) and projects (each with a first step). `actionId` is undone with
 * POST /api/agent/actions/:id/undo, which archives all of it. Pro, Lifetime
 * and trial only. The same op, `starter.create`, is reachable from outside
 * through /api/connect/ops/starter.create.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;

  const input = starterCreateSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!input.success) {
    return NextResponse.json(
      { error: "Nothing valid to create" },
      { status: 400 }
    );
  }

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "starter-game-create:account", 10, 60)],
    { route: "/api/starter-game/create", userId: auth.userId }
  );
  if (limited) return limited;

  try {
    const run = await runOp<StarterCreateResult>("starter.create", input.data, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: "user",
    });
    return NextResponse.json({
      result: run.result,
      actionId: run.actionId,
      undoable: run.undoable,
      undoableUntil: run.undoableUntil,
    });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
