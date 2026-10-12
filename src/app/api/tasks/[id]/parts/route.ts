import { NextRequest, NextResponse } from "next/server";

import {
  nextPartPosition,
  notFound,
  partCreateSchema,
  partSelect,
  readBody,
  scopedTaskId,
} from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-parts-route";
type RouteContext = { params: Promise<{ id: string }> };

/** The task's parts, in order. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const parts = await prisma.taskPart.findMany({
      where: { taskId },
      orderBy: { position: "asc" },
      select: partSelect,
    });
    return NextResponse.json(parts);
  } catch (error) {
    logger.error(
      "Failed to list task parts",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/** Add a part; without `position` it goes last. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId) return notFound();
    const body = await readBody(request, partCreateSchema);
    if ("response" in body) return body.response;
    const part = await prisma.taskPart.create({
      data: {
        taskId,
        title: body.data.title,
        done: body.data.done ?? false,
        position: body.data.position ?? (await nextPartPosition(taskId)),
      },
      select: partSelect,
    });
    return NextResponse.json(part, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to add a task part",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
