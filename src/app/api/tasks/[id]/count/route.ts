import { NextRequest, NextResponse } from "next/server";

import {
  notFound,
  readBody,
  scopedTaskId,
  touchTaskAfterPartWrite,
} from "@/services/tasks/parts-waits";
import { countSchema, setTaskCount } from "@/services/tasks/task-count";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-count-route";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * The task's counter (plan 11 T-1): `{ target, done }`, read from its unnamed
 * parts. `target: 0` means it is not a counter.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const parts = await prisma.taskPart.findMany({
      where: { taskId },
      select: { title: true, done: true },
    });
    const counter = parts.length > 0 && parts.every((p) => !p.title.trim());
    return NextResponse.json({
      counter,
      target: counter ? parts.length : 0,
      done: counter ? parts.filter((p) => p.done).length : 0,
    });
  } catch (error) {
    logger.error(
      "Failed to read a task count",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/**
 * Set the counter: `{ target, done? }`. `target: 0` removes it. Refused with
 * 409 NAMED_PARTS when the task already has named subtasks. Reaching the
 * target does not close the task by itself, the same as ticking a part.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const state = await prisma.task.findUnique({
      where: { id: taskId },
      select: { isArchived: true, trashedAt: true },
    });
    if (state?.isArchived || state?.trashedAt)
      return NextResponse.json(
        { error: "TASK_READ_ONLY", message: "Restore the task to count it." },
        { status: 409 }
      );
    const body = await readBody(request, countSchema);
    if ("response" in body) return body.response;
    const result = await setTaskCount(taskId, body.data);
    if (!result.ok)
      return NextResponse.json(
        {
          error: result.error,
          message:
            "This task has named subtasks. A count is for a task made of unnamed ones.",
        },
        { status: 409 }
      );
    await touchTaskAfterPartWrite(auth.userId, taskId);
    return NextResponse.json({
      target: result.target,
      done: result.done,
      parts: result.parts,
    });
  } catch (error) {
    logger.error(
      "Failed to set a task count",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
