import { PageAccessRole, Prisma } from "@prisma/client";

import {
  inheritedPageRole,
  pageRoleAtLeast,
  pageVisibilityWhere,
  resolvePageAccess,
} from "@/lib/auth/page-auth";
import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

export type PageActor =
  | string
  | {
      userId: string;
      workspace?: WorkspaceAccess;
    };

export function pageActorUserId(actor: PageActor) {
  return typeof actor === "string" ? actor : actor.userId;
}

export function pageActorScope(actor: PageActor) {
  const userId = pageActorUserId(actor);
  return typeof actor === "string" ? { userId } : pageVisibilityWhere(actor);
}

export async function pageActorCanAccess(
  actor: PageActor,
  pageId: string,
  role: PageAccessRole,
  options: { includeTrashed?: boolean } = {}
) {
  if (typeof actor === "string") {
    return prisma.page.findFirst({
      where: {
        id: pageId,
        userId: actor,
        ...(options.includeTrashed ? {} : { trashedAt: null }),
      },
      select: { id: true },
    });
  }
  return resolvePageAccess(actor, pageId, role, options);
}

export async function pageActorCanAccessInTransaction(
  tx: Prisma.TransactionClient,
  actor: PageActor,
  pageId: string,
  requiredRole: PageAccessRole
) {
  if (typeof actor === "string") {
    return tx.page.findFirst({
      where: { id: pageId, userId: actor, trashedAt: null },
      select: { id: true },
    });
  }

  const page = await tx.page.findFirst({
    where: {
      id: pageId,
      ...workspaceDataScopeWhere(actor.workspace, actor.userId),
      trashedAt: null,
    },
    select: {
      id: true,
      userId: true,
      isPrivate: true,
      accessGrants: {
        where: { userId: actor.userId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!page) return null;

  let workspaceRole = actor.workspace?.role;
  if (actor.workspace?.dataScope.mode === "workspace") {
    const membership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: actor.workspace.dataScope.workspaceId,
          userId: actor.userId,
        },
      },
      select: { role: true },
    });
    if (!membership) return null;
    workspaceRole = membership.role;
  }

  const directRole = page.accessGrants[0]?.role;
  const role =
    page.userId === actor.userId
      ? PageAccessRole.FULL_ACCESS
      : (directRole ??
        (page.isPrivate || !workspaceRole
          ? null
          : inheritedPageRole(workspaceRole)));
  return role && pageRoleAtLeast(role, requiredRole) ? { id: page.id } : null;
}

export function pageActorWorkspaceId(actor: PageActor) {
  return typeof actor === "string" ? undefined : actor.workspace?.workspaceId;
}

export const pageDetailInclude = {
  folder: { select: { id: true, name: true, color: true } },
  tags: { select: { id: true, name: true, color: true } },
  blocks: { orderBy: { position: "asc" as const } },
  children: {
    where: { trashedAt: null },
    orderBy: { position: "asc" as const },
  },
  database: {
    include: {
      properties: { orderBy: { position: "asc" as const } },
      views: { orderBy: { position: "asc" as const } },
      records: {
        orderBy: { position: "asc" as const },
        include: {
          page: true,
          values: true,
        },
      },
    },
  },
} satisfies Prisma.PageInclude;
