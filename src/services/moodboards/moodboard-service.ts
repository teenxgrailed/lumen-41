import { MoodboardAccessRole, Prisma } from "@prisma/client";

import {
  type MoodboardAccessActor,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

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

export async function listMoodboards(actor: MoodboardActor) {
  const workspace = scope(actor);
  if (!workspace) return [];
  return prisma.moodboard.findMany({
    where: { ...workspace, archivedAt: null },
    select: moodboardSelect,
    orderBy: { updatedAt: "desc" },
  });
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
  return moodboard ? { ...moodboard, accessRole: access.role } : null;
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
