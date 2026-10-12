import { NextRequest, NextResponse } from "next/server";

import { authenticateAgentRequest } from "@/services/ops/http";

import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "agent-actions";

/**
 * The caller's own action log, newest first. Filters: `runId`, `limit`
 * (1-100, default 50). Only the caller's actions are ever returned.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;

  const runId = request.nextUrl.searchParams.get("runId") || undefined;
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit")) || 50, 1),
    100
  );
  const actions = await prisma.agentAction.findMany({
    where: { userId: auth.userId, ...(runId ? { runId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      runId: true,
      workspaceId: true,
      actor: true,
      op: true,
      input: true,
      status: true,
      undoableUntil: true,
      undoneAt: true,
      createdAt: true,
      inverse: true,
    },
  });
  return NextResponse.json({
    actions: actions.map(({ inverse, ...action }) => ({
      ...action,
      undoable: Boolean(inverse) && action.status !== "undone",
    })),
  });
}
