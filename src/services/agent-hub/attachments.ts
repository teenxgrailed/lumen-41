import { Prisma } from "@prisma/client";
import type { HubAgent } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  downloadUrl,
  signLink,
  uploadUrl,
  verifyLink,
} from "./attachment-links";
import {
  HUB_ATTACHMENT_ACCOUNT_QUOTA_BYTES,
  HUB_ATTACHMENT_MAX_BYTES,
  HUB_ATTACHMENT_MAX_PER_ITEM,
  HUB_ATTACHMENT_UPLOAD_TTL_MS,
  HUB_ATTACHMENT_URL_TTL_MS,
  refusal,
  resolveAttachmentType,
  safeAttachmentName,
  validateAttachment,
} from "./attachment-rules";
import type { HubScope } from "./context";
import { HubError } from "./errors";
import { visibleToAgent } from "./items";
import { assertHubAttachments } from "./limits";
import { assertNoSecrets } from "./secret-scan";

/**
 * Files on hub items. The item decides who may see them: the owner sees every
 * item of the workspace, an agent only the ones that concern it, and nothing
 * outside the account's workspace exists. Bytes live in
 * `HubItemAttachmentBlob` under `storageKey`; swapping in an object store
 * later changes only `putBytes` / `getBytes`.
 */

async function putBytes(
  tx: Prisma.TransactionClient,
  key: string,
  bytes: Buffer
) {
  await tx.hubItemAttachmentBlob.create({ data: { id: key, bytes } });
}

async function getBytes(key: string): Promise<Buffer | null> {
  const row = await prisma.hubItemAttachmentBlob.findUnique({
    where: { id: key },
    select: { bytes: true },
  });
  return row ? Buffer.from(row.bytes) : null;
}

async function visibleItem(scope: HubScope, itemId: string) {
  const item = await prisma.hubItem.findFirst({
    where: { id: itemId, userId: scope.userId, workspaceId: scope.workspaceId },
  });
  if (
    !item ||
    (scope.actor.kind === "agent" && !visibleToAgent(item, scope.actor.agent))
  ) {
    throw new HubError("NOT_FOUND", "Item not found.");
  }
  return item;
}

const select = {
  id: true,
  itemId: true,
  name: true,
  mime: true,
  size: true,
  uploaderKind: true,
  uploaderAgentId: true,
  createdAt: true,
} as const;

type Row = Prisma.HubItemAttachmentGetPayload<{ select: typeof select }>;

export function attachmentView(row: Row, userId: string, nowMs: number) {
  const link = signLink(
    "get",
    { a: row.id, u: userId },
    HUB_ATTACHMENT_URL_TTL_MS,
    nowMs
  );
  return {
    id: row.id,
    itemId: row.itemId,
    name: row.name,
    mime: row.mime,
    size: row.size,
    uploadedBy: row.uploaderKind,
    uploaderAgentId: row.uploaderAgentId,
    createdAt: row.createdAt.toISOString(),
    url: downloadUrl(link.token),
    urlExpiresAt: new Date(link.expiresAt).toISOString(),
  };
}

export async function listAttachments(scope: HubScope, itemId: string) {
  await visibleItem(scope, itemId);
  const rows = await prisma.hubItemAttachment.findMany({
    where: { itemId, userId: scope.userId, workspaceId: scope.workspaceId },
    select,
    orderBy: { createdAt: "asc" },
  });
  const now = newDate().getTime();
  return {
    attachments: rows.map((row) => attachmentView(row, scope.userId, now)),
  };
}

interface Uploader {
  userId: string;
  workspaceId: string;
  kind: "agent" | "owner";
  agentId: string | null;
}

function uploaderOf(scope: HubScope): Uploader {
  return {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    kind: scope.actor.kind,
    agentId: scope.actor.kind === "agent" ? scope.actor.agent.id : null,
  };
}

async function store(
  upload: Uploader,
  input: {
    itemId: string;
    name: string;
    mime: string;
    bytes: Buffer;
    /** Makes a replayed upload link return the first result. */
    storageKey?: string;
  }
) {
  const storageKey = input.storageKey ?? `hub-${randomUUID()}`;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const count = await tx.hubItemAttachment.count({
        where: { itemId: input.itemId },
      });
      if (count >= HUB_ATTACHMENT_MAX_PER_ITEM) {
        throw refusal(
          "TOO_MANY",
          `An item holds at most ${HUB_ATTACHMENT_MAX_PER_ITEM} files.`
        );
      }
      const used = await tx.hubItemAttachment.aggregate({
        where: { userId: upload.userId },
        _sum: { size: true },
      });
      if (
        (used._sum.size ?? 0) + input.bytes.length >
        HUB_ATTACHMENT_ACCOUNT_QUOTA_BYTES
      ) {
        throw refusal(
          "QUOTA",
          "This account's attachment storage (500 MB) is full. Ask the owner to free space."
        );
      }
      const created = await tx.hubItemAttachment.create({
        data: {
          itemId: input.itemId,
          userId: upload.userId,
          workspaceId: upload.workspaceId,
          uploaderKind: upload.kind,
          uploaderAgentId: upload.agentId,
          name: input.name,
          mime: input.mime,
          size: input.bytes.length,
          storageKey,
        },
        select,
      });
      await putBytes(tx, storageKey, input.bytes);
      await tx.hubItemEvent.create({
        data: {
          itemId: input.itemId,
          actorKind: upload.kind,
          actorAgentId: upload.agentId,
          type: "attachment_added",
          message: `Attached ${input.name} (${input.mime}, ${input.bytes.length} bytes).`,
          data: { attachmentId: created.id },
        },
      });
      return created;
    });
    return attachmentView(row, upload.userId, newDate().getTime());
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      input.storageKey
    ) {
      const existing = await prisma.hubItemAttachment.findUnique({
        where: { storageKey: input.storageKey },
        select,
      });
      if (existing)
        return attachmentView(existing, upload.userId, newDate().getTime());
    }
    throw error;
  }
}

/** Largest base64 text that can decode to a file within the cap. */
const MAX_BASE64_CHARS = Math.ceil((HUB_ATTACHMENT_MAX_BYTES * 4) / 3) + 8;

/** Attach bytes sent inline (base64) or read from a multipart upload. */
export async function addAttachment(
  scope: HubScope,
  input: {
    itemId: string;
    name: string;
    contentBase64?: string;
    bytes?: Buffer;
    mime?: string;
  }
) {
  await visibleItem(scope, input.itemId);
  await assertHubAttachments(scope.userId);
  let bytes = input.bytes;
  if (!bytes) {
    const text = (input.contentBase64 ?? "").replace(/^data:[^,]*,/, "");
    if (text.length > MAX_BASE64_CHARS) {
      throw refusal("TOO_LARGE", "Attachments must be 25 MB or smaller.");
    }
    bytes = Buffer.from(text, "base64");
  }
  const { name, mime } = validateAttachment({
    name: input.name,
    bytes,
    declaredMime: input.mime,
  });
  return {
    attachment: await store(uploaderOf(scope), {
      itemId: input.itemId,
      name,
      mime,
      bytes,
    }),
  };
}

/**
 * A short-lived URL to PUT the raw bytes to, so a large file never passes
 * through the model. Checks the name and type now; the bytes are checked
 * again when they arrive.
 */
export async function prepareUpload(
  scope: HubScope,
  input: { itemId: string; name: string; mime?: string }
) {
  await visibleItem(scope, input.itemId);
  await assertHubAttachments(scope.userId);
  const name = safeAttachmentName(input.name);
  if (!name) throw refusal("BAD_TYPE", "The file needs a name.");
  assertNoSecrets({ name });
  // Extension and executable checks on the name alone (no bytes yet).
  resolveAttachmentType(name, new Uint8Array(0), input.mime);
  const now = newDate().getTime();
  const link = signLink(
    "put",
    {
      i: input.itemId,
      u: scope.userId,
      w: scope.workspaceId,
      k: scope.actor.kind,
      g: scope.actor.kind === "agent" ? scope.actor.agent.id : null,
      n: name,
      m: input.mime ?? null,
    },
    HUB_ATTACHMENT_UPLOAD_TTL_MS,
    now
  );
  return {
    method: "PUT",
    uploadUrl: uploadUrl(link.token),
    expiresAt: new Date(link.expiresAt).toISOString(),
    maxBytes: HUB_ATTACHMENT_MAX_BYTES,
    contentType: "application/octet-stream",
    note: "PUT the raw file bytes to uploadUrl (no Authorization header needed). The answer is the attachment.",
  };
}

interface PutClaims extends Record<string, unknown> {
  i: string;
  u: string;
  w: string;
  k: "agent" | "owner";
  g: string | null;
  n: string;
  m: string | null;
}

export async function receiveUpload(
  token: string | null,
  bytes: Buffer,
  nowMs = newDate().getTime()
) {
  const claims = verifyLink<PutClaims>("put", token, nowMs);
  if (!claims) {
    throw new HubError(
      "FORBIDDEN",
      "This upload link is invalid or has expired."
    );
  }
  const item = await prisma.hubItem.findFirst({
    where: { id: claims.i, userId: claims.u, workspaceId: claims.w },
    select: { id: true },
  });
  if (!item) throw new HubError("NOT_FOUND", "Item not found.");
  // The plan may have changed between prepareUpload and this PUT.
  await assertHubAttachments(claims.u);
  const { name, mime } = validateAttachment({
    name: claims.n,
    bytes,
    declaredMime: claims.m ?? undefined,
  });
  const storageKey = `hub-put-${createHash("sha256")
    .update(token ?? "")
    .digest("hex")
    .slice(0, 32)}`;
  return {
    attachment: await store(
      {
        userId: claims.u,
        workspaceId: claims.w,
        kind: claims.k,
        agentId: claims.g,
      },
      { itemId: claims.i, name, mime, bytes, storageKey }
    ),
  };
}

/** The bytes behind a signed download link (24 h). */
export async function readSigned(
  token: string | null,
  nowMs = newDate().getTime()
) {
  const claims = verifyLink<{ a: string; u: string }>("get", token, nowMs);
  if (!claims) {
    throw new HubError(
      "FORBIDDEN",
      "This download link is invalid or has expired."
    );
  }
  return readOne(claims.a, claims.u);
}

async function readOne(id: string, userId: string) {
  const row = await prisma.hubItemAttachment.findFirst({
    where: { id, userId },
    select: { name: true, mime: true, storageKey: true },
  });
  const bytes = row ? await getBytes(row.storageKey) : null;
  if (!row || !bytes) throw new HubError("NOT_FOUND", "Attachment not found.");
  return { name: row.name, mime: row.mime, bytes };
}

/** The owner's own download (session), still limited to their workspace. */
export async function readAsOwner(scope: HubScope, id: string) {
  const row = await prisma.hubItemAttachment.findFirst({
    where: { id, userId: scope.userId, workspaceId: scope.workspaceId },
    select: { id: true },
  });
  if (!row) throw new HubError("NOT_FOUND", "Attachment not found.");
  return readOne(id, scope.userId);
}

export type { HubAgent };
