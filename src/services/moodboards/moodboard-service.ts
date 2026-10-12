import { MoodboardAccessRole, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import {
  type MoodboardAccessActor,
  inheritedMoodboardRole,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  MOODBOARD_ITEM_LIMIT,
  MOODBOARD_ITEM_ORDER,
  parseAssetPath,
} from "./moodboard-item-service";

export type MoodboardActor = MoodboardAccessActor;

/** One shape for every moodboard response, including the design v3 fields. */
const moodboardSelect = {
  id: true,
  title: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
  linkShare: true,
  pinterestBoardId: true,
  pinterestStatus: true,
  pinterestSyncedAt: true,
  trashedAt: true,
} satisfies Prisma.MoodboardSelect;

async function assertWorkspaceProject(
  workspace: { workspaceId: string },
  projectId: string | null | undefined
) {
  if (!projectId) return;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...workspace },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found");
}

function scope(actor: MoodboardActor) {
  return actor.workspace ? { workspaceId: actor.workspace.workspaceId } : null;
}

/**
 * The grid's collage: how many references a board holds and its first
 * three in wall order, so the list draws every cover from one query instead
 * of one items request per board. Only what a tile needs; a long note's text
 * is cut so the list stays small.
 */
export const MOODBOARD_PREVIEW_COUNT = 3;
const PREVIEW_TEXT_MAX = 120;

const previewSelect = {
  id: true,
  kind: true,
  url: true,
  color: true,
  text: true,
  thumbnailUrl: true,
} satisfies Prisma.MoodboardItemSelect;

export type MoodboardSortKey = "updated" | "created" | "name";
export interface MoodboardSort {
  key: MoodboardSortKey;
  dir: "asc" | "desc";
}
export const DEFAULT_MOODBOARD_SORT: MoodboardSort = {
  key: "updated",
  dir: "desc",
};

/** `?sort=updated|created|name&dir=asc|desc`; anything else is the default. */
export function parseMoodboardSort(
  sort: string | null | undefined,
  dir: string | null | undefined
): MoodboardSort {
  const key: MoodboardSortKey =
    sort === "created" || sort === "name" || sort === "updated"
      ? sort
      : DEFAULT_MOODBOARD_SORT.key;
  // Names read A to Z, dates newest first, unless the caller says otherwise.
  const natural = key === "name" ? "asc" : "desc";
  return { key, dir: dir === "asc" || dir === "desc" ? dir : natural };
}

const ROLE_RANK = { VIEWER: 0, EDITOR: 1, FULL_ACCESS: 2 } as const;

/** The people a card shows: who else is on the board (never the caller). */
const MEMBER_FACES = 4;

export async function listMoodboards(
  actor: MoodboardActor,
  sort: MoodboardSort = DEFAULT_MOODBOARD_SORT
) {
  const workspace = scope(actor);
  if (!workspace) return [];
  const rows = await prisma.moodboard.findMany({
    where: { ...workspace, archivedAt: null },
    select: {
      ...moodboardSelect,
      _count: { select: { items: true } },
      items: {
        orderBy: MOODBOARD_ITEM_ORDER,
        take: MOODBOARD_PREVIEW_COUNT,
        select: previewSelect,
      },
      createdBy: { select: { id: true, name: true, email: true } },
      accessGrants: {
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true, image: true } },
        },
      },
      // Only whether the old canvas ever stored anything: its bytes are not read here.
      collaborationState: { select: { id: true } },
    },
    // Dates sort in the database; names are sorted below (case-insensitive).
    orderBy:
      sort.key === "name"
        ? { createdAt: "desc" }
        : sort.key === "created"
          ? { createdAt: sort.dir }
          : { updatedAt: sort.dir },
  });
  const inherited = actor.workspace
    ? inheritedMoodboardRole(actor.workspace.role)
    : MoodboardAccessRole.VIEWER;
  const list = rows.map(
    ({
      _count,
      items,
      createdBy,
      accessGrants = [],
      collaborationState,
      ...board
    }) => {
      const mine = accessGrants.find((g) => g.userId === actor.userId)?.role;
      const accessRole =
        board.createdById === actor.userId
          ? MoodboardAccessRole.FULL_ACCESS
          : (mine ?? inherited);
      return {
        ...board,
        itemCount: _count.items,
        hasCanvas: !!collaborationState,
        accessRole,
        owner: createdBy
          ? { id: createdBy.id, name: createdBy.name, email: createdBy.email }
          : null,
        memberCount: accessGrants.length,
        members: accessGrants.slice(0, MEMBER_FACES).map((g) => ({
          userId: g.userId,
          role: g.role,
          name: g.user?.name ?? null,
          email: g.user?.email ?? null,
          image: g.user?.image ?? null,
        })),
        preview: items.map((item) => ({
          ...item,
          text: item.text ? item.text.slice(0, PREVIEW_TEXT_MAX) : item.text,
        })),
      };
    }
  );
  if (sort.key === "name") {
    const flip = sort.dir === "asc" ? 1 : -1;
    list.sort(
      (a, b) =>
        flip *
        (a.title || "").localeCompare(b.title || "", undefined, {
          sensitivity: "base",
        })
    );
  }
  return list;
}

export async function createMoodboard(
  actor: MoodboardActor,
  input: { title?: string; projectId?: string | null }
) {
  const workspace = scope(actor);
  if (!workspace) return null;
  await assertWorkspaceProject(workspace, input.projectId);
  return prisma.moodboard.create({
    data: {
      ...workspace,
      createdById: actor.userId,
      title: input.title?.trim().slice(0, 240) || "Untitled Moodboard",
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    select: moodboardSelect,
  });
}

export async function getMoodboard(actor: MoodboardActor, moodboardId: string) {
  const access = await resolveMoodboardAccess(actor, moodboardId);
  if (!access) return null;
  const moodboard = await prisma.moodboard.findFirst({
    where: { id: moodboardId, ...scope(actor), archivedAt: null },
    select: moodboardSelect,
  });
  if (!moodboard) return null;
  return {
    ...moodboard,
    accessRole: access.role,
    // Only the people who can turn the link off see its address.
    ...(moodboard.linkShare && ROLE_RANK[access.role] >= ROLE_RANK.FULL_ACCESS
      ? { shareToken: moodboardLinkToken(moodboard.id) }
      : {}),
  };
}

/* ---------- "Anyone with the link" ---------- */

/**
 * The secret half of a board's public address, `/b/<id>/<token>`: an HMAC of
 * the id under the server's auth secret. Board ids alone are guessable, so the
 * link needs more than the id; turning "Anyone with the link" off makes every
 * such address stop working (the flag is checked on every read).
 */
export function moodboardLinkToken(moodboardId: string) {
  return createHmac("sha256", authSecret())
    .update(`moodboard-link:v1:${moodboardId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function moodboardLinkTokenValid(moodboardId: string, token: string) {
  const want = Buffer.from(moodboardLinkToken(moodboardId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** A board's public view: only when link sharing is on and the board is live. */
export async function getPublicMoodboard(moodboardId: string, token: string) {
  if (!moodboardLinkTokenValid(moodboardId, token)) return null;
  const board = await prisma.moodboard.findFirst({
    where: {
      id: moodboardId,
      linkShare: true,
      archivedAt: null,
      trashedAt: null,
    },
    select: { id: true, title: true, updatedAt: true },
  });
  if (!board) return null;
  const items = await prisma.moodboardItem.findMany({
    where: { moodboardId },
    orderBy: MOODBOARD_ITEM_ORDER,
    take: MOODBOARD_ITEM_LIMIT,
    select: {
      id: true,
      kind: true,
      url: true,
      color: true,
      text: true,
      title: true,
      ratio: true,
      colorName: true,
      source: true,
      thumbnailUrl: true,
    },
  });
  const asset = (url: string | null) => {
    const a = url ? parseAssetPath(url) : null;
    return a && a.moodboardId === moodboardId
      ? `/api/public/moodboards/${moodboardId}/${token}/assets/${a.assetId}`
      : url;
  };
  return {
    id: board.id,
    title: board.title,
    items: items.map((i) => {
      const src = i.source as { name?: string; domain?: string } | null;
      return {
        id: i.id,
        kind: i.kind,
        url: i.kind === "image" ? asset(i.url) : i.url,
        color: i.color,
        text: i.text,
        title: i.title,
        ratio: i.ratio,
        colorName: i.colorName,
        source: src && typeof src === "object" ? src : null,
        thumbnailUrl: i.thumbnailUrl,
      };
    }),
  };
}

/** An uploaded picture of a publicly shared board. */
export async function readPublicMoodboardAsset(
  moodboardId: string,
  token: string,
  assetId: string
) {
  if (!moodboardLinkTokenValid(moodboardId, token)) return null;
  const board = await prisma.moodboard.findFirst({
    where: {
      id: moodboardId,
      linkShare: true,
      archivedAt: null,
      trashedAt: null,
    },
    select: { id: true },
  });
  if (!board) return null;
  const asset = await prisma.moodboardAsset.findFirst({
    where: { id: assetId, moodboardId },
    select: { bytes: true, mimeType: true },
  });
  return asset
    ? { bytes: Buffer.from(asset.bytes), mimeType: asset.mimeType }
    : null;
}

/**
 * Delete forever (Trash): the board with its items, pictures and people. Only
 * from Trash, and only with full access; the canvas state and snapshots go
 * with it because they hang off the board.
 */
export async function deleteMoodboardForever(
  actor: MoodboardActor,
  moodboardId: string
) {
  if (
    !(await resolveMoodboardAccess(
      actor,
      moodboardId,
      MoodboardAccessRole.FULL_ACCESS
    ))
  ) {
    return "denied" as const;
  }
  const workspace = scope(actor);
  if (!workspace) return "denied" as const;
  const { count } = await prisma.moodboard.deleteMany({
    where: { id: moodboardId, ...workspace, trashedAt: { not: null } },
  });
  return count ? ("deleted" as const) : ("not_in_trash" as const);
}

export async function updateMoodboard(
  actor: MoodboardActor,
  moodboardId: string,
  input: {
    title?: string;
    archived?: boolean;
    projectId?: string | null;
    linkShare?: boolean;
    pinterestBoardId?: string | null;
    trashed?: boolean;
  }
) {
  const requiredRole =
    input.archived ||
    input.trashed !== undefined ||
    input.linkShare !== undefined
      ? MoodboardAccessRole.FULL_ACCESS
      : MoodboardAccessRole.EDITOR;
  if (!(await resolveMoodboardAccess(actor, moodboardId, requiredRole))) {
    return null;
  }
  const workspace = scope(actor);
  if (!workspace) return null;
  if (input.projectId !== undefined) {
    await assertWorkspaceProject(workspace, input.projectId);
  }
  const data: Prisma.MoodboardUncheckedUpdateManyInput = {
    ...(typeof input.title === "string" && {
      title: input.title.trim().slice(0, 240) || "Untitled Moodboard",
    }),
    ...(typeof input.archived === "boolean" && {
      archivedAt: input.archived ? newDate() : null,
    }),
    ...(input.projectId !== undefined && { projectId: input.projectId }),
    ...(typeof input.linkShare === "boolean" && {
      linkShare: input.linkShare,
    }),
    ...(input.pinterestBoardId !== undefined && {
      pinterestBoardId: input.pinterestBoardId,
    }),
    ...(typeof input.trashed === "boolean" && {
      trashedAt: input.trashed ? newDate() : null,
    }),
  };
  const updated = await prisma.moodboard.updateMany({
    where: { id: moodboardId, ...workspace },
    data,
  });
  if (updated.count === 0) return null;
  return prisma.moodboard.findFirst({
    where: { id: moodboardId, ...workspace },
    select: moodboardSelect,
  });
}

export async function listMoodboardSnapshots(
  actor: MoodboardActor,
  moodboardId: string
) {
  if (
    !(await resolveMoodboardAccess(
      actor,
      moodboardId,
      MoodboardAccessRole.FULL_ACCESS
    ))
  ) {
    return null;
  }
  return prisma.moodboardSnapshot.findMany({
    where: { moodboardId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
}

export async function getMoodboardSnapshot(
  actor: MoodboardActor,
  moodboardId: string,
  snapshotId: string
) {
  if (
    !(await resolveMoodboardAccess(
      actor,
      moodboardId,
      MoodboardAccessRole.FULL_ACCESS
    ))
  ) {
    return null;
  }
  return prisma.moodboardSnapshot.findFirst({
    where: { id: snapshotId, moodboardId },
    select: { id: true, scene: true, createdAt: true },
  });
}
