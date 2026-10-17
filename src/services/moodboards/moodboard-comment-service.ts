import { MoodboardAccessRole } from "@prisma/client";
import { z } from "zod";

import {
  type MoodboardAccessActor,
  moodboardRoleAtLeast,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  MoodboardItemAccessError,
  MoodboardItemNotFoundError,
  MoodboardTrashedError,
} from "./moodboard-item-service";

/**
 * Comments on one reference of a moodboard grid (`MoodboardItemComment`),
 * following the page-comment pattern: anyone who can see the board reads them,
 * an editor writes, and the author or full access resolves or deletes. The
 * same service backs the board page, the phone sheet and the public API.
 */

export const COMMENT_MAX_LENGTH = 4_000;

export const createCommentSchema = z
  .object({ body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH) })
  .strict();
export const updateCommentSchema = z.object({ resolved: z.boolean() }).strict();

const commentSelect = {
  id: true,
  itemId: true,
  moodboardId: true,
  authorId: true,
  body: true,
  resolvedAt: true,
  createdAt: true,
  author: { select: { name: true, email: true, image: true } },
} as const;

async function requireItem(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  role: MoodboardAccessRole
) {
  const access = await resolveMoodboardAccess(actor, moodboardId, role);
  if (!access) throw new MoodboardItemAccessError();
  if (role !== MoodboardAccessRole.VIEWER && access.trashed) {
    throw new MoodboardTrashedError();
  }
  const item = await prisma.moodboardItem.findFirst({
    where: { id: itemId, moodboardId },
    select: { id: true },
  });
  if (!item) throw new MoodboardItemNotFoundError();
  return access;
}

/** Open comments first (oldest first, the order a thread is read), then resolved. */
export async function listItemComments(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string
) {
  await requireItem(actor, moodboardId, itemId, MoodboardAccessRole.VIEWER);
  return prisma.moodboardItemComment.findMany({
    where: { itemId, moodboardId },
    orderBy: [
      { resolvedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    select: commentSelect,
    take: 500,
  });
}

export async function createItemComment(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  input: z.infer<typeof createCommentSchema>
) {
  await requireItem(actor, moodboardId, itemId, MoodboardAccessRole.EDITOR);
  return prisma.moodboardItemComment.create({
    data: { itemId, moodboardId, authorId: actor.userId, body: input.body },
    select: commentSelect,
  });
}

async function loadOwnComment(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  commentId: string
) {
  const access = await requireItem(
    actor,
    moodboardId,
    itemId,
    MoodboardAccessRole.EDITOR
  );
  const comment = await prisma.moodboardItemComment.findFirst({
    where: { id: commentId, itemId, moodboardId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new MoodboardItemNotFoundError();
  // The author, or someone with full access, may change it.
  if (
    comment.authorId !== actor.userId &&
    !moodboardRoleAtLeast(access.role, MoodboardAccessRole.FULL_ACCESS)
  ) {
    throw new MoodboardItemAccessError();
  }
  return comment;
}

export async function setItemCommentResolved(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  commentId: string,
  resolved: boolean
) {
  await loadOwnComment(actor, moodboardId, itemId, commentId);
  return prisma.moodboardItemComment.update({
    where: { id: commentId },
    data: { resolvedAt: resolved ? newDate() : null },
    select: commentSelect,
  });
}

export async function deleteItemComment(
  actor: MoodboardAccessActor,
  moodboardId: string,
  itemId: string,
  commentId: string
) {
  await loadOwnComment(actor, moodboardId, itemId, commentId);
  await prisma.moodboardItemComment.delete({ where: { id: commentId } });
}
