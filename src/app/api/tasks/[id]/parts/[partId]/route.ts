import { NextRequest, NextResponse } from "next/server";

import {
  notFound,
  partPatchSchema,
  partSelect,
  readBody,
  scopedTaskId,
} from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-part-route";
type RouteContext = { params: Promise<{ id: string; partId: string }> };

/** The part when it belongs to a task the caller may see, else null. */
async function scopedPart(
  auth: Parameters<typeof scopedTaskId>[0],
  id: string,
  partId: string
) {
  const taskId = await scopedTaskId(auth, id);
  if (!taskId) return null;
  return prisma.taskPart.findFirst({
    where: { id: partId, taskId },
    select: { id: true },
  });
}

/** Rename, tick or move a part. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id, partId } = await params;
    if (!(await scopedPart(auth, id, partId))) return notFound("Part");
    const body = await readBody(request, partPatchSchema);
    if ("response" in body) return body.response;
    const part = await prisma.taskPart.update({
      where: { id: partId },
      data: body.data,
      select: partSelect,
    });
    return NextResponse.json(part);
  } catch (error) {
    logger.error(
      "Failed to update a task part",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/** Delete a part. Answers with the deleted part, so undo can re-create it. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  try {
    const { id, partId } = await params;
    if (!(await scopedPart(auth, id, partId))) return notFound("Part");
    const part = await prisma.taskPart.delete({
      where: { id: partId },
      select: partSelect,
    });
    return NextResponse.json(part);
  } catch (error) {
    logger.error(
      "Failed to delete a task part",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
