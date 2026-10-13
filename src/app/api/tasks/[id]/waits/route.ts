import { NextRequest, NextResponse } from "next/server";

import {
  canWaitOn,
  notFound,
  openWait,
  readBody,
  scopedTaskId,
  waitCreateSchema,
} from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "task-waits-route";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * The task now waits on a person (`on`, a user id) for something (`for`).
 * Any earlier open wait on the task is resolved.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const body = await readBody(request, waitCreateSchema);
    if ("response" in body) return body.response;
    if (!(await canWaitOn(auth, body.data.on))) {
      return NextResponse.json(
        { error: "PERSON_NOT_IN_WORKSPACE" },
        { status: 400 }
      );
    }
    const wait = await openWait(taskId, body.data.on, body.data.for);
    return NextResponse.json(wait, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to open a task wait",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
