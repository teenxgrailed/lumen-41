import {
  type PageActor,
  pageActorCanAccess as actorCanAccess,
  pageActorScope as actorPageScope,
  pageActorUserId as actorUserId,
  pageActorWorkspaceId as actorWorkspaceId,
  pageDetailInclude,
} from "@/services/pages/page-model";
import {
  type PageBlockInput,
  writePageBlocks,
} from "@/services/pages/page-write-path";
import {
  AiProposalStatus,
  DatabasePropertyType,
  DatabaseViewType,
  PageAccessRole,
  PageAuthor,
  PageBlockType,
  Prisma,
} from "@prisma/client";

import { pageSummaryAccessRole } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

export type { PageActor } from "@/services/pages/page-model";

export async function listPages(
  actor: PageActor,
  options?: {
    search?: string;
    folderId?: string;
    tagIds?: string[];
    favorites?: boolean;
    privateOnly?: boolean;
    /** List the trash instead of the live pages. */
    trashed?: boolean;
  }
) {
  const tagIds = [...new Set(options?.tagIds ?? [])];
  const pages = await prisma.page.findMany({
    where: {
      ...actorPageScope(actor),
      trashedAt: options?.trashed ? { not: null } : null,
      ...(options?.folderId ? { folderId: options.folderId } : {}),
      ...(options?.favorites ? { isFavorite: true } : {}),
      ...(options?.privateOnly ? { isPrivate: true } : {}),
      ...(tagIds.length
        ? {
            AND: tagIds.map((id) => ({ tags: { some: { id } } })),
          }
        : {}),
      ...(options?.search?.trim()
        ? {
            title: {
              contains: options.search.trim(),
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      parentId: true,
      title: true,
      icon: true,
      isPrivate: true,
      isFavorite: true,
      folderId: true,
      folder: { select: { id: true, name: true, color: true } },
      tags: { select: { id: true, name: true, color: true } },
      createdBy: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      coverUrl: true,
      projectId: true,
      style: true,
      trashedAt: true,
      database: { select: { id: true } },
      accessGrants: {
        where: { userId: actorUserId(actor) },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: [
      { isFavorite: "desc" },
      { position: "asc" },
      { updatedAt: "desc" },
    ],
  });
  return pages.map(({ userId, accessGrants, ...page }) => ({
    ...page,
    accessRole: pageSummaryAccessRole(actor, {
      userId,
      isPrivate: page.isPrivate,
      accessGrants,
    }),
    ...pageShareFlags(actor, { userId, accessGrants }),
  }));
}

/**
 * Additive list fields: `isOwner` is true when the actor owns the page, and
 * `sharedWithMe` only when someone else owns it and gave the actor an explicit
 * grant. A role inherited from workspace membership is not a share.
 */
export function pageShareFlags(
  actor: PageActor,
  page: { userId: string | null; accessGrants: readonly unknown[] }
) {
  const isOwner =
    typeof actor === "string" || page.userId === actorUserId(actor);
  return { isOwner, sharedWithMe: !isOwner && page.accessGrants.length > 0 };
}

export async function getPage(actor: PageActor, pageId: string) {
  return prisma.page.findFirst({
    where: { id: pageId, ...actorPageScope(actor), trashedAt: null },
    include: pageDetailInclude,
  });
}

/**
 * Brings a page back from the trash. Needs the same access as trashing it
 * (FULL_ACCESS), read with trashed rows included since every other check
 * hides them. Idempotent: a page that is not in the trash is returned as it
 * is, with no write. Children, blocks and assets were never touched by the
 * trash, so they come back with the page. A page whose parent is still in
 * the trash would return under a hidden parent; it comes back at the top
 * level instead.
 */
export async function restorePage(actor: PageActor, pageId: string) {
  const access = await actorCanAccess(
    actor,
    pageId,
    PageAccessRole.FULL_ACCESS,
    { includeTrashed: true }
  );
  if (!access) return null;
  const page = await prisma.page.findFirst({
    where: { id: pageId, ...actorPageScope(actor) },
    select: { id: true, trashedAt: true, parentId: true },
  });
  if (!page) return null;
  if (page.trashedAt) {
    const trashedParent = page.parentId
      ? await prisma.page.findFirst({
          where: { id: page.parentId, trashedAt: { not: null } },
          select: { id: true },
        })
      : null;
    await prisma.page.updateMany({
      where: { id: pageId, trashedAt: { not: null } },
      data: { trashedAt: null, ...(trashedParent ? { parentId: null } : {}) },
    });
  }
  return getPage(actor, pageId);
}

async function assertOwnedParent(actor: PageActor, parentId?: string | null) {
  if (!parentId) return;
  const parent = await actorCanAccess(actor, parentId, PageAccessRole.EDITOR);
  if (!parent) throw new Error("Parent page not found");
}

/** A page may only be filed under a project the actor's workspace owns. */
async function assertScopedProject(
  actor: PageActor,
  projectId?: string | null
) {
  if (!projectId) return;
  const workspaceId = actorWorkspaceId(actor);
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(workspaceId ? { workspaceId } : { userId: actorUserId(actor) }),
    },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found");
}

export async function createPage(
  actor: PageActor,
  input: {
    title?: string;
    parentId?: string | null;
    icon?: string | null;
    isPrivate?: boolean;
    createdBy?: PageAuthor;
    style?: Prisma.InputJsonObject | null;
    projectId?: string | null;
  }
) {
  const userId = actorUserId(actor);
  await assertOwnedParent(actor, input.parentId);
  await assertScopedProject(actor, input.projectId);
  const last = await prisma.page.findFirst({
    where: {
      ...actorPageScope(actor),
      parentId: input.parentId ?? null,
      trashedAt: null,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.page.create({
    data: {
      userId,
      ...(actorWorkspaceId(actor) && { workspaceId: actorWorkspaceId(actor) }),
      parentId: input.parentId ?? null,
      title: input.title?.trim().slice(0, 240) || "Untitled",
      icon: input.icon?.slice(0, 32) || null,
      isPrivate: input.isPrivate === true,
      createdBy: input.createdBy ?? PageAuthor.HUMAN,
      position: (last?.position ?? 0) + 1024,
      ...(input.style ? { style: input.style } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      blocks: {
        create: {
          type: PageBlockType.PARAGRAPH,
          content: { text: "" },
          position: 1024,
          createdBy: input.createdBy ?? PageAuthor.HUMAN,
        },
      },
    },
    include: pageDetailInclude,
  });
}

export async function updatePage(
  actor: PageActor,
  pageId: string,
  input: {
    title?: string;
    icon?: string | null;
    coverUrl?: string | null;
    parentId?: string | null;
    isPrivate?: boolean;
    isFavorite?: boolean;
    position?: number;
    trashed?: boolean;
    style?: Prisma.InputJsonObject | null;
    projectId?: string | null;
  }
): Promise<Awaited<ReturnType<typeof getPage>>> {
  if (input.trashed === false) {
    // Restoring reads the trashed row; every other change waits until the
    // page is live again and then goes through the normal checks below.
    const restored = await restorePage(actor, pageId);
    if (!restored) return null;
    const { trashed: _restored, ...rest } = input;
    void _restored;
    const hasOtherChanges = Object.values(rest).some(
      (value) => value !== undefined
    );
    return hasOtherChanges ? updatePage(actor, pageId, rest) : restored;
  }
  const requiredRole =
    input.isPrivate !== undefined || input.trashed !== undefined
      ? PageAccessRole.FULL_ACCESS
      : PageAccessRole.EDITOR;
  if (!(await actorCanAccess(actor, pageId, requiredRole))) return null;
  const existing = await getPage(actor, pageId);
  if (!existing) return null;
  if (input.parentId === pageId)
    throw new Error("A page cannot contain itself");
  if (input.parentId !== undefined) {
    await assertOwnedParent(actor, input.parentId);
  }
  if (input.projectId !== undefined) {
    await assertScopedProject(actor, input.projectId);
  }
  return prisma.page.update({
    where: { id: pageId },
    data: {
      ...(input.title !== undefined
        ? { title: input.title.trim().slice(0, 240) || "Untitled" }
        : {}),
      ...(input.icon !== undefined
        ? { icon: input.icon?.slice(0, 32) || null }
        : {}),
      ...(input.coverUrl !== undefined
        ? { coverUrl: input.coverUrl || null }
        : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
      ...(input.isFavorite !== undefined
        ? { isFavorite: input.isFavorite }
        : {}),
      ...(Number.isFinite(input.position) ? { position: input.position } : {}),
      ...(input.trashed !== undefined
        ? { trashedAt: input.trashed ? new Date() : null }
        : {}),
      ...(input.style !== undefined
        ? { style: input.style ?? Prisma.DbNull }
        : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    },
    include: pageDetailInclude,
  });
}

export async function createDatabase(
  actor: PageActor,
  input: { title?: string; parentId?: string | null; isPrivate?: boolean }
) {
  const page = await createPage(actor, input);
  return prisma.page.update({
    where: { id: page.id },
    data: {
      database: {
        create: {
          properties: {
            create: [
              {
                name: "Name",
                type: DatabasePropertyType.TITLE,
                position: 1024,
              },
              {
                name: "Status",
                type: DatabasePropertyType.SELECT,
                position: 2048,
              },
              { name: "Date", type: DatabasePropertyType.DATE, position: 3072 },
            ],
          },
          views: {
            create: {
              name: "Table",
              type: DatabaseViewType.TABLE,
              position: 1024,
            },
          },
        },
      },
    },
    include: pageDetailInclude,
  });
}

export async function listAiReadablePages(actor: PageActor, query?: string) {
  const pages = await prisma.page.findMany({
    where: {
      ...actorPageScope(actor),
      trashedAt: null,
    },
    include: { blocks: { orderBy: { position: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  const byId = new Map(pages.map((page) => [page.id, page]));
  const isPrivateTree = (page: (typeof pages)[number]) => {
    let cursor: (typeof pages)[number] | undefined = page;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.isPrivate) return true;
      if (!cursor.parentId || visited.has(cursor.parentId)) return false;
      visited.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
    }
    return false;
  };
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  return pages
    .filter(
      (page) =>
        !isPrivateTree(page) &&
        (!normalizedQuery ||
          page.title.toLocaleLowerCase().includes(normalizedQuery))
    )
    .slice(0, 50);
}

export async function createAiProposal(
  actor: PageActor,
  pageId: string,
  input: { summary: string; operations: Prisma.InputJsonValue }
) {
  if (!(await actorCanAccess(actor, pageId, PageAccessRole.EDITOR))) {
    throw new Error("Page is private or unavailable");
  }
  const userId = actorUserId(actor);
  const page = await prisma.page.findFirst({
    where: { id: pageId, ...actorPageScope(actor), trashedAt: null },
    select: { id: true, parentId: true, isPrivate: true },
  });
  if (!page) throw new Error("Page is private or unavailable");
  let cursor: {
    id: string;
    parentId: string | null;
    isPrivate: boolean;
  } | null = page;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor.isPrivate) throw new Error("Page is private or unavailable");
    if (!cursor.parentId || visited.has(cursor.parentId)) break;
    visited.add(cursor.parentId);
    cursor = await prisma.page.findFirst({
      where: {
        id: cursor.parentId,
        ...actorPageScope(actor),
        trashedAt: null,
      },
      select: { id: true, parentId: true, isPrivate: true },
    });
  }
  return prisma.aiPageChangeProposal.create({
    data: {
      userId,
      pageId,
      summary: input.summary.slice(0, 500),
      operations: input.operations,
    },
  });
}

export async function rejectAiProposal(actor: PageActor, proposalId: string) {
  const userId = actorUserId(actor);
  const proposal = await prisma.aiPageChangeProposal.findFirst({
    where: { id: proposalId, userId, status: AiProposalStatus.PENDING },
  });
  if (!proposal) return null;
  if (!(await actorCanAccess(actor, proposal.pageId, PageAccessRole.VIEWER))) {
    return null;
  }
  return prisma.aiPageChangeProposal.update({
    where: { id: proposalId },
    data: { status: AiProposalStatus.REJECTED },
  });
}

export async function getAiProposal(userId: string, proposalId: string) {
  return prisma.aiPageChangeProposal.findFirst({
    where: { id: proposalId, userId },
    include: {
      page: {
        select: { id: true, title: true, isPrivate: true, updatedAt: true },
      },
    },
  });
}

export async function applyAiProposal(actor: PageActor, proposalId: string) {
  const userId = actorUserId(actor);
  const proposal = await getAiProposal(userId, proposalId);
  if (!proposal || proposal.status !== AiProposalStatus.PENDING) {
    return null;
  }
  if (!(await actorCanAccess(actor, proposal.pageId, PageAccessRole.EDITOR))) {
    return null;
  }
  const operations = Array.isArray(proposal.operations)
    ? proposal.operations
    : [];
  const blocks: PageBlockInput[] = [];
  for (const operation of operations) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation))
      continue;
    const candidate = operation as Prisma.JsonObject;
    if (candidate.type !== "append_block") continue;
    const blockType = candidate.blockType;
    if (
      typeof blockType !== "string" ||
      !Object.values(PageBlockType).includes(blockType as PageBlockType)
    ) {
      continue;
    }
    blocks.push({
      type: blockType as PageBlockType,
      content: JSON.parse(JSON.stringify(candidate.content ?? { text: "" })),
      position: 0,
      createdBy: PageAuthor.AI,
    });
  }

  const page = await getPage(actor, proposal.pageId);
  if (!page) return null;
  let cursor: {
    id: string;
    parentId: string | null;
    isPrivate: boolean;
  } | null = page;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor.isPrivate) return null;
    if (!cursor.parentId || visited.has(cursor.parentId)) break;
    visited.add(cursor.parentId);
    cursor = await prisma.page.findFirst({
      where: {
        id: cursor.parentId,
        ...actorPageScope(actor),
        trashedAt: null,
      },
      select: { id: true, parentId: true, isPrivate: true },
    });
  }
  if (blocks.length > 0) {
    await writePageBlocks(
      actor,
      page.id,
      [
        ...page.blocks.map((block) => ({
          id: block.id,
          parentBlockId: block.parentBlockId,
          type: block.type,
          content: JSON.parse(JSON.stringify(block.content)),
          position: block.position,
          createdBy: block.createdBy,
        })),
        ...blocks.map((block, index) => ({
          ...block,
          position: (page.blocks.at(-1)?.position ?? 0) + (index + 1) * 1024,
        })),
      ],
      PageAuthor.AI,
      page.documentFormatVersion === 2 ? 2 : 1,
      page.contentRevision
    );
  }
  return prisma.aiPageChangeProposal.update({
    where: { id: proposalId },
    data: { status: AiProposalStatus.APPLIED, appliedAt: new Date() },
  });
}

export async function listPageRevisions(actor: PageActor, pageId: string) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, ...actorPageScope(actor), trashedAt: null },
    select: { id: true },
  });
  if (!page) return null;
  return prisma.pageRevision.findMany({
    where: { pageId },
    select: { id: true, createdAt: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listPageBacklinks(actor: PageActor, pageId: string) {
  const pages = await prisma.page.findMany({
    where: { ...actorPageScope(actor), trashedAt: null, id: { not: pageId } },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      blocks: { select: { content: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return pages
    .filter((page) =>
      page.blocks.some((block) => {
        const content = JSON.stringify(block.content);
        return (
          content.includes(`\"pageId\":\"${pageId}\"`) ||
          content.includes(`\"url\":\"/pages/${pageId}\"`)
        );
      })
    )
    .map((page) => ({
      id: page.id,
      title: page.title,
      icon: page.icon,
      updatedAt: page.updatedAt,
    }));
}

export async function restorePageRevision(
  actor: PageActor,
  pageId: string,
  revisionId: string
) {
  if (!(await actorCanAccess(actor, pageId, PageAccessRole.EDITOR)))
    return null;
  const revision = await prisma.pageRevision.findFirst({
    where: {
      id: revisionId,
      pageId,
      page: { ...actorPageScope(actor), trashedAt: null },
    },
    select: {
      snapshot: true,
      page: { select: { documentFormatVersion: true, contentRevision: true } },
    },
  });
  if (
    !revision ||
    !revision.snapshot ||
    typeof revision.snapshot !== "object"
  ) {
    return null;
  }
  const snapshot = revision.snapshot as Prisma.JsonObject;
  const blocks = Array.isArray(snapshot.blocks)
    ? snapshot.blocks.filter(
        (block): block is Prisma.JsonObject =>
          Boolean(block) && typeof block === "object" && !Array.isArray(block)
      )
    : [];
  const restored = await writePageBlocks(
    actor,
    pageId,
    blocks.flatMap((block, index) => {
      const type = block.type;
      const content = block.content;
      if (
        typeof type !== "string" ||
        !Object.values(PageBlockType).includes(type as PageBlockType) ||
        content === undefined
      ) {
        return [];
      }
      return [
        {
          id: typeof block.id === "string" ? block.id : undefined,
          parentBlockId:
            typeof block.parentBlockId === "string"
              ? block.parentBlockId
              : null,
          type: type as PageBlockType,
          content: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue,
          position:
            typeof block.position === "number"
              ? block.position
              : (index + 1) * 1024,
          createdBy:
            block.createdBy === PageAuthor.AI
              ? PageAuthor.AI
              : PageAuthor.HUMAN,
        },
      ];
    }),
    PageAuthor.HUMAN,
    revision.page.documentFormatVersion === 2 ? 2 : 1,
    revision.page.contentRevision
  );
  if (!restored) return null;
  return prisma.page.update({
    where: { id: pageId },
    data: {
      title:
        typeof snapshot.title === "string"
          ? snapshot.title.slice(0, 240) || "Untitled"
          : undefined,
      icon:
        typeof snapshot.icon === "string" ? snapshot.icon.slice(0, 32) : null,
    },
    include: pageDetailInclude,
  });
}
