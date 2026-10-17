import { NextRequest, NextResponse } from "next/server";

import {
  TASK_ATTACHMENT_STATUS,
  TaskAttachmentError,
  deleteTaskAttachment,
  readTaskAttachment,
} from "@/services/tasks/attachments";
import { scopedTaskId } from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "task-attachment-route";
type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

function fail(error: unknown) {
  if (error instanceof TaskAttachmentError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: TASK_ATTACHMENT_STATUS[error.code] }
    );
  }
  return routeErrorResponse(
    error,
    "Task attachment request failed",
    LOG_SOURCE,
    "Could not complete the request."
  );
}

/** The file itself, for anyone who can see the task. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id, attachmentId } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const file = await readTaskAttachment(taskId, attachmentId);
    const isImage = file.mimeType.startsWith("image/");
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return fail(error);
  }
}

/** Remove one file from the task. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const { id, attachmentId } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    await deleteTaskAttachment(taskId, attachmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
