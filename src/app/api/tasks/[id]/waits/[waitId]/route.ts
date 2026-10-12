import { NextRequest, NextResponse } from "next/server";

import {
  notFound,
  readBody,
  scopedTaskId,
  waitPatchSchema,
  waitSelect,
} from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-wait-route";
type RouteContext = { params: Promise<{ id: string; waitId: string }> };

/**
 * `{ resolved: true }` resolves the wait (the row stays as history);
 * `{ resolved: false }` reopens it — the undo of a resolve — and resolves any
 * other open wait, since a task waits on one person at a time.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id, waitId } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const found = await prisma.taskWait.findFirst({
      where: { id: waitId, taskId },
      select: { id: true },
    });
    if (!found) return notFound("Wait");
    const body = await readBody(request, waitPatchSchema);
    if ("response" in body) return body.response;
    const now = newDate();
    const wait = body.data.resolved
      ? await prisma.taskWait.update({
          where: { id: waitId },
          data: { resolvedAt: now },
          select: waitSelect,
        })
      : (
          await prisma.$transaction([
            prisma.taskWait.updateMany({
              where: { taskId, resolvedAt: null, id: { not: waitId } },
              data: { resolvedAt: now },
            }),
            prisma.taskWait.update({
              where: { id: waitId },
              data: { resolvedAt: null },
              select: waitSelect,
            }),
          ])
        )[1];
    return NextResponse.json(wait);
  } catch (error) {
    logger.error(
      "Failed to update a task wait",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
