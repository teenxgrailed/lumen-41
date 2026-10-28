import { sniffImageType } from "@/services/moodboards/moodboard-item-service";

import { prisma } from "@/lib/prisma";
import { SANDBOX_UPLOAD_MAX_BYTES, isSandboxUser } from "@/lib/sandbox/guard";

/** The client, or a transaction, the file functions run on. */
type Db = Pick<typeof prisma, "taskAttachment">;

/**
 * Files on a task (`TaskAttachment`): the bytes live in the row, as
 * `MoodboardAsset` does. Images (JPEG, PNG, WebP, GIF) and PDF only, 4 MB
 * each, ten per task. The type is read from the bytes, never from what the
 * client said, and every download is served `nosniff`.
 */
export const TASK_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const TASK_ATTACHMENT_LIMIT = 10;

export type TaskAttachmentErrorCode =
  | "EMPTY"
  | "TOO_LARGE"
  | "SANDBOX_TOO_LARGE"
  | "BAD_TYPE"
  | "TOO_MANY"
  | "NOT_FOUND";

const MESSAGES: Record<TaskAttachmentErrorCode, string> = {
  EMPTY: "That file is empty.",
  TOO_LARGE: "Attachments must be 4 MB or smaller.",
  SANDBOX_TOO_LARGE:
    "This is a sandbox account that resets nightly: files must be 1 MB or smaller.",
  BAD_TYPE: "Only images and PDF files can be attached.",
  TOO_MANY: `A task holds at most ${TASK_ATTACHMENT_LIMIT} files.`,
  NOT_FOUND: "Attachment not found.",
};

export const TASK_ATTACHMENT_STATUS: Record<TaskAttachmentErrorCode, number> = {
  EMPTY: 400,
  TOO_LARGE: 413,
  SANDBOX_TOO_LARGE: 413,
  BAD_TYPE: 415,
  TOO_MANY: 409,
  NOT_FOUND: 404,
};

export class TaskAttachmentError extends Error {
  constructor(public readonly code: TaskAttachmentErrorCode) {
    super(MESSAGES[code]);
    this.name = "TaskAttachmentError";
  }
}

/** The type the bytes really are: an allowed image, `application/pdf`, or null. */
export function sniffAttachmentType(bytes: Uint8Array): string | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  // "%PDF-"
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
    return "application/pdf";
  return null;
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** A safe display name: no path, no control characters, at most 240 characters. */
export function attachmentName(raw: string, mimeType: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return base.slice(0, 240) || `attachment.${EXTENSION[mimeType] ?? "bin"}`;
}

export const attachmentSelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

export interface TaskAttachmentView {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  /** Where the bytes are read from. */
  url: string;
}

export function attachmentView(
  taskId: string,
  row: {
    id: string;
    name: string;
    mimeType: string | null;
    size: number | null;
    createdAt: Date;
  }
): TaskAttachmentView {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    url: `/api/tasks/${taskId}/attachments/${row.id}`,
  };
}

export async function listTaskAttachments(taskId: string, db: Db = prisma) {
  const rows = await db.taskAttachment.findMany({
    where: { taskId, bytes: { not: null } },
    select: attachmentSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => attachmentView(taskId, row));
}

/** Stores one file on a task the caller may already edit. */
export async function addTaskAttachment(
  input: {
    taskId: string;
    userId: string;
    name: string;
    bytes: Buffer;
  },
  db: Db = prisma
) {
  if (input.bytes.length === 0) throw new TaskAttachmentError("EMPTY");
  if (input.bytes.length > TASK_ATTACHMENT_MAX_BYTES)
    throw new TaskAttachmentError("TOO_LARGE");
  // Sandbox accounts (docs/sandbox-accounts.md) keep files small. Asked only
  // for a file over the sandbox cap, so a normal upload pays nothing.
  if (
    input.bytes.length > SANDBOX_UPLOAD_MAX_BYTES &&
    (await isSandboxUser(input.userId))
  )
    throw new TaskAttachmentError("SANDBOX_TOO_LARGE");
  const mimeType = sniffAttachmentType(input.bytes);
  if (!mimeType) throw new TaskAttachmentError("BAD_TYPE");
  const count = await db.taskAttachment.count({
    where: { taskId: input.taskId },
  });
  if (count >= TASK_ATTACHMENT_LIMIT) throw new TaskAttachmentError("TOO_MANY");
  const row = await db.taskAttachment.create({
    data: {
      taskId: input.taskId,
      userId: input.userId,
      name: attachmentName(input.name, mimeType),
      mimeType,
      size: input.bytes.length,
      bytes: input.bytes,
    },
    select: attachmentSelect,
  });
  return attachmentView(input.taskId, row);
}

export async function readTaskAttachment(
  taskId: string,
  id: string,
  db: Db = prisma
) {
  const row = await db.taskAttachment.findFirst({
    where: { id, taskId, bytes: { not: null } },
    select: { name: true, mimeType: true, bytes: true },
  });
  if (!row || !row.bytes) throw new TaskAttachmentError("NOT_FOUND");
  return {
    name: row.name,
    mimeType: row.mimeType ?? "application/octet-stream",
    bytes: Buffer.from(row.bytes),
  };
}

export async function deleteTaskAttachment(
  taskId: string,
  id: string,
  db: Db = prisma
) {
  const { count } = await db.taskAttachment.deleteMany({
    where: { id, taskId },
  });
  if (!count) throw new TaskAttachmentError("NOT_FOUND");
}
