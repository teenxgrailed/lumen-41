import { NextRequest, NextResponse } from "next/server";

import {
  TASK_ATTACHMENT_MAX_BYTES,
  TASK_ATTACHMENT_STATUS,
  TaskAttachmentError,
  addTaskAttachment,
  listTaskAttachments,
} from "@/services/tasks/attachments";
import { scopedTaskId } from "@/services/tasks/parts-waits";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "task-attachments-route";
type RouteContext = { params: Promise<{ id: string }> };

/** Room for the multipart envelope (boundaries, field names). */
const FORM_OVERHEAD = 64 * 1024;

/** The request body, or "too_large" once more than `max` bytes have arrived (the stream is cancelled). */
async function readCapped(
  request: NextRequest,
  max: number
): Promise<Buffer | "too_large"> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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

/** The files on a task: name, type, size, and where to read each one. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({
      attachments: await listTaskAttachments(taskId),
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Attach a file: multipart `file` (JPEG, PNG, WebP, GIF or PDF, up to 4 MB;
 * the type is read from the bytes). Ten files per task.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const taskId = await scopedTaskId(auth, id);
    if (!taskId)
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { isArchived: true },
    });
    if (task?.isArchived)
      return NextResponse.json(
        { error: "Archived tasks are read-only." },
        { status: 409 }
      );
    // The cap is enforced on the bytes as they arrive, so a missing or lying
    // Content-Length does not skip it.
    const body = await readCapped(
      request,
      TASK_ATTACHMENT_MAX_BYTES + FORM_OVERHEAD
    );
    if (body === "too_large")
      return NextResponse.json(
        { error: "Attachments must be 4 MB or smaller." },
        { status: 413 }
      );
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(body), {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "Choose a file" }, { status: 400 });
    const attachment = await addTaskAttachment({
      taskId,
      userId: auth.userId,
      name: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
