import {
  collaborationDocumentToPageBlocks,
  replacePageCollaborationDocumentBlocks,
} from "@/services/pages/page-collaboration-document";
import {
  type PageActor,
  pageActorCanAccess,
  pageActorCanAccessInTransaction,
  pageActorUserId,
  pageDetailIncludeFor,
} from "@/services/pages/page-model";
import {
  PageAccessRole,
  PageAuthor,
  PageBlockType,
  Prisma,
} from "@prisma/client";

import { Yjs as Y } from "@/lib/collaboration/yjs";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const COLLABORATION_LEASE_MS = 45_000;

export interface PageBlockInput {
  id?: string;
  parentBlockId?: string | null;
  type: PageBlockType;
  content: Prisma.InputJsonValue;
  position: number;
  createdBy?: PageAuthor;
}

export class PageBlockIdentityError extends Error {
  readonly code = "DUPLICATE_BLOCK_ID";
}

export class PageCollaborationActiveError extends Error {
  readonly code = "PAGE_COLLABORATION_ACTIVE";

  constructor() {
    super("A live collaboration session owns this page");
  }
}

export class PageCollaborationLeaseExpiredError extends Error {
  readonly code = "PAGE_COLLABORATION_LEASE_EXPIRED";

  constructor() {
    super(
      "The page collaboration lease expired before the document was stored"
    );
  }
}

export class PageRevisionConflictError extends Error {
  readonly code = "OFFLINE_REVISION_CONFLICT";

  constructor() {
    super("The page changed after this write was prepared");
  }
}

async function lockPageWrite(tx: Prisma.TransactionClient, pageId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${pageId}, 0))::text`
  );
}

function leaseExpiry() {
  return newDate(newDate().getTime() + COLLABORATION_LEASE_MS);
}

async function clearExpiredLeases(
  tx: Prisma.TransactionClient,
  pageId: string
) {
  await tx.pageCollaborationSession.deleteMany({
    where: { pageId, expiresAt: { lte: newDate() } },
  });
}

export async function openPageCollaborationSession(
  pageId: string,
  sessionId: string
) {
  return prisma.$transaction(async (tx) => {
    await lockPageWrite(tx, pageId);
    const page = await tx.page.findUnique({
      where: { id: pageId },
      select: { id: true },
    });
    if (!page) return false;
    await clearExpiredLeases(tx, pageId);
    await tx.pageCollaborationSession.upsert({
      where: { pageId_sessionId: { pageId, sessionId } },
      create: { pageId, sessionId, expiresAt: leaseExpiry() },
      update: { expiresAt: leaseExpiry() },
    });
    return true;
  });
}

export async function touchPageCollaborationSession(
  pageId: string,
  sessionId: string
) {
  return prisma.$transaction(async (tx) => {
    await lockPageWrite(tx, pageId);
    const result = await tx.pageCollaborationSession.updateMany({
      where: { pageId, sessionId },
      data: { expiresAt: leaseExpiry() },
    });
    return result.count > 0;
  });
}

export async function closePageCollaborationSessions(
  pageId: string,
  sessionIds: string[]
) {
  if (sessionIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await lockPageWrite(tx, pageId);
    await tx.pageCollaborationSession.deleteMany({
      where: { pageId, sessionId: { in: sessionIds } },
    });
  });
}

type PageWriteSource =
  | { kind: "snapshot" }
  | { kind: "collaboration"; sessionId: string; state: Uint8Array };

async function persistPageBlocks(
  actor: PageActor,
  pageId: string,
  blocks: PageBlockInput[],
  createdBy: PageAuthor,
  documentFormatVersion: 1 | 2,
  source: PageWriteSource,
  expectedContentRevision?: number
) {
  if (
    source.kind === "snapshot" &&
    !(await pageActorCanAccess(actor, pageId, PageAccessRole.EDITOR))
  ) {
    return null;
  }
  if (blocks.length > 2_000) throw new Error("Page has too many blocks");

  const normalized = blocks.map((block, index) => ({
    id: block.id,
    parentBlockId: block.parentBlockId ?? null,
    type: block.type,
    content: block.content,
    position: Number.isFinite(block.position)
      ? block.position
      : (index + 1) * 1024,
    createdBy: block.createdBy ?? createdBy,
  }));
  const requestedIds = normalized
    .map((block) => block.id)
    .filter((id): id is string => Boolean(id));
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new PageBlockIdentityError("Page block IDs must be unique");
  }

  return prisma.$transaction(async (tx) => {
    await lockPageWrite(tx, pageId);
    if (
      source.kind === "snapshot" &&
      !(await pageActorCanAccessInTransaction(
        tx,
        actor,
        pageId,
        PageAccessRole.EDITOR
      ))
    ) {
      return null;
    }
    await clearExpiredLeases(tx, pageId);
    if (source.kind === "snapshot") {
      const liveSessions = await tx.pageCollaborationSession.count({
        where: { pageId },
      });
      if (liveSessions > 0) throw new PageCollaborationActiveError();
    } else {
      const session = await tx.pageCollaborationSession.findUnique({
        where: {
          pageId_sessionId: { pageId, sessionId: source.sessionId },
        },
        select: { pageId: true },
      });
      if (!session) throw new PageCollaborationLeaseExpiredError();
    }

    const page = await tx.page.findUnique({
      where: { id: pageId },
      include: pageDetailIncludeFor(actor),
    });
    if (!page) return null;
    if (
      expectedContentRevision !== undefined &&
      page.contentRevision !== expectedContentRevision
    ) {
      throw new PageRevisionConflictError();
    }
    const userId = pageActorUserId(actor);

    if (page.documentFormatVersion !== documentFormatVersion) {
      await tx.page.update({
        where: { id: pageId },
        data: { documentFormatVersion },
      });
    }
    await tx.pageRevision.create({
      data: {
        pageId,
        userId,
        createdBy,
        snapshot: {
          title: page.title,
          icon: page.icon,
          blocks: page.blocks.map((block) => ({
            id: block.id,
            parentBlockId: block.parentBlockId,
            type: block.type,
            content: block.content,
            position: block.position,
            createdBy: block.createdBy,
          })),
        },
      },
    });

    const foreignBlocks = requestedIds.length
      ? await tx.pageBlock.count({
          where: { id: { in: requestedIds }, pageId: { not: pageId } },
        })
      : 0;
    if (foreignBlocks > 0) {
      throw new Error("A page block ID belongs to another page");
    }

    await tx.pageBlock.updateMany({
      where: { pageId },
      data: { parentBlockId: null },
    });
    await tx.pageBlock.deleteMany({
      where: {
        pageId,
        ...(requestedIds.length > 0 ? { id: { notIn: requestedIds } } : {}),
      },
    });

    const reconciledIds: string[] = [];
    for (const block of normalized) {
      if (block.id) {
        await tx.pageBlock.upsert({
          where: { id: block.id },
          update: {
            type: block.type,
            content: block.content,
            position: block.position,
            createdBy: block.createdBy,
          },
          create: {
            id: block.id,
            pageId,
            type: block.type,
            content: block.content,
            position: block.position,
            createdBy: block.createdBy,
          },
        });
        reconciledIds.push(block.id);
      } else {
        const created = await tx.pageBlock.create({
          data: {
            pageId,
            type: block.type,
            content: block.content,
            position: block.position,
            createdBy: block.createdBy,
          },
          select: { id: true },
        });
        reconciledIds.push(created.id);
      }
    }

    const reconciledBlocks = normalized.map((block, index) => ({
      id: reconciledIds[index],
      parentBlockId: block.parentBlockId,
      type: block.type,
      content: block.content,
      position: block.position,
      createdBy: block.createdBy,
    }));
    const validIds = new Set(reconciledIds);
    for (const block of reconciledBlocks) {
      if (!block.parentBlockId) continue;
      if (!validIds.has(block.parentBlockId)) {
        throw new Error("Parent block must belong to the same page");
      }
      if (block.parentBlockId === block.id) {
        throw new Error("A page block cannot contain itself");
      }
      await tx.pageBlock.update({
        where: { id: block.id },
        data: { parentBlockId: block.parentBlockId },
      });
    }

    let state = source.kind === "collaboration" ? source.state : null;
    if (!state) {
      const document = new Y.Doc();
      const existingState = await tx.pageCollaborationState.findUnique({
        where: { pageId },
        select: { state: true },
      });
      if (existingState) {
        Y.applyUpdate(document, new Uint8Array(existingState.state));
      }
      replacePageCollaborationDocumentBlocks(document, reconciledBlocks);
      state = Y.encodeStateAsUpdate(document);
      document.destroy();
    }
    await tx.pageCollaborationState.upsert({
      where: { pageId },
      create: { pageId, state: Buffer.from(state) },
      update: { state: Buffer.from(state) },
    });
    await tx.page.update({
      where: { id: pageId },
      data: { contentRevision: { increment: 1 }, updatedAt: newDate() },
    });
    return tx.page.findUnique({
      where: { id: pageId },
      include: pageDetailIncludeFor(actor),
    });
  });
}

export function writePageBlocks(
  actor: PageActor,
  pageId: string,
  blocks: PageBlockInput[],
  createdBy: PageAuthor = PageAuthor.HUMAN,
  documentFormatVersion: 1 | 2 = 1,
  expectedContentRevision?: number
) {
  return persistPageBlocks(
    actor,
    pageId,
    blocks,
    createdBy,
    documentFormatVersion,
    { kind: "snapshot" },
    expectedContentRevision
  );
}

export function storePageCollaborationDocument(
  actor: PageActor,
  pageId: string,
  sessionId: string,
  document: Y.Doc,
  documentFormatVersion: 1 | 2 = 1
) {
  return persistPageBlocks(
    actor,
    pageId,
    collaborationDocumentToPageBlocks(document),
    PageAuthor.HUMAN,
    documentFormatVersion,
    {
      kind: "collaboration",
      sessionId,
      state: Y.encodeStateAsUpdate(document),
    }
  );
}
