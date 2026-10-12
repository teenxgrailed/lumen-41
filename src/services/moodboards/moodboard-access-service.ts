import { MoodboardAccessRole } from "@prisma/client";

import {
  type MoodboardAccessActor,
  resolveMoodboardAccess,
} from "@/lib/auth/moodboard-auth";
import { prisma } from "@/lib/prisma";

import { touchMoodboard } from "./moodboard-item-service";

export class MoodboardAccessServiceError extends Error {
  constructor(
    public readonly code:
      | "MOODBOARD_NOT_FOUND"
      | "MOODBOARD_FULL_ACCESS_REQUIRED"
      | "WORKSPACE_MEMBER_REQUIRED"
      | "MOODBOARD_CREATOR_ACCESS_FIXED",
    public readonly status: 403 | 404
  ) {
    super(code);
    this.name = "MoodboardAccessServiceError";
  }
}

async function requireFullAccess(
  actor: MoodboardAccessActor,
  moodboardId: string
) {
  const access = await resolveMoodboardAccess(
    actor,
    moodboardId,
    MoodboardAccessRole.FULL_ACCESS
  );
  if (!access) {
    throw new MoodboardAccessServiceError(
      "MOODBOARD_FULL_ACCESS_REQUIRED",
      403
    );
  }
  if (!actor.workspace) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  const moodboard = await prisma.moodboard.findFirst({
    where: {
      id: moodboardId,
      workspaceId: actor.workspace.workspaceId,
      archivedAt: null,
    },
    select: { id: true, createdById: true, workspaceId: true },
  });
  if (!moodboard) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  return moodboard;
}

/**
 * Who is on a board. Anyone who can see the board may read it (the phone's
 * "People" view); only full access also gets `candidates`, the workspace
 * members an invite by email can reach.
 */
export async function listMoodboardAccessGrants(
  actor: MoodboardAccessActor,
  moodboardId: string
) {
  const access = await resolveMoodboardAccess(actor, moodboardId);
  if (!access || !actor.workspace) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  const moodboard = await prisma.moodboard.findFirst({
    where: {
      id: moodboardId,
      workspaceId: actor.workspace.workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      createdById: true,
      workspaceId: true,
      linkShare: true,
      createdBy: { select: { name: true, email: true, image: true } },
    },
  });
  if (!moodboard) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  const grants = await prisma.moodboardAccessGrant.findMany({
    where: { moodboardId },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const full = access.role === MoodboardAccessRole.FULL_ACCESS;
  const candidates = full
    ? (
        await prisma.workspaceMember.findMany({
          where: { workspaceId: moodboard.workspaceId },
          select: {
            userId: true,
            user: { select: { name: true, email: true, image: true } },
          },
        })
      ).map((m) => ({ userId: m.userId, user: m.user }))
    : [];
  return {
    creatorId: moodboard.createdById,
    creator: moodboard.createdBy,
    linkShare: moodboard.linkShare,
    myRole: access.role,
    grants,
    candidates,
  };
}

export async function setMoodboardAccessGrant(
  actor: MoodboardAccessActor,
  moodboardId: string,
  userId: string,
  role: MoodboardAccessRole
) {
  const moodboard = await requireFullAccess(actor, moodboardId);
  if (moodboard.createdById === userId) {
    throw new MoodboardAccessServiceError(
      "MOODBOARD_CREATOR_ACCESS_FIXED",
      403
    );
  }
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: moodboard.workspaceId, userId },
    },
    select: { userId: true },
  });
  if (!member) {
    throw new MoodboardAccessServiceError("WORKSPACE_MEMBER_REQUIRED", 403);
  }
  const grant = await prisma.moodboardAccessGrant.upsert({
    where: { moodboardId_userId: { moodboardId, userId } },
    create: { moodboardId, userId, role, grantedById: actor.userId },
    update: { role, grantedById: actor.userId },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: true, image: true } },
    },
  });
  await touchMoodboard(prisma, moodboardId);
  return grant;
}

/**
 * Invite by email (View → VIEWER, Edit → EDITOR). Only people already in the
 * board's workspace can be reached: nobody is emailed, and an address with no
 * account here has nothing to attach a grant to. //todo: a ShareInvite row for
 * them (data map M2) once there is an accept step.
 */
export async function inviteMoodboardMember(
  actor: MoodboardAccessActor,
  moodboardId: string,
  email: string,
  role: MoodboardAccessRole
) {
  const moodboard = await requireFullAccess(actor, moodboardId);
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: moodboard.workspaceId,
      user: { email: { equals: email.trim(), mode: "insensitive" } },
    },
    select: { userId: true },
  });
  if (!member) {
    throw new MoodboardAccessServiceError("WORKSPACE_MEMBER_REQUIRED", 403);
  }
  return setMoodboardAccessGrant(actor, moodboardId, member.userId, role);
}

export async function removeMoodboardAccessGrant(
  actor: MoodboardAccessActor,
  moodboardId: string,
  userId: string
) {
  // Anyone may take themselves off a board that is not theirs ("Leave board");
  // taking someone else off needs full access.
  const leaving = userId === actor.userId;
  const moodboard = leaving
    ? await requireAnyAccess(actor, moodboardId)
    : await requireFullAccess(actor, moodboardId);
  if (moodboard.createdById === userId) {
    throw new MoodboardAccessServiceError(
      "MOODBOARD_CREATOR_ACCESS_FIXED",
      403
    );
  }
  await prisma.moodboardAccessGrant.deleteMany({
    where: { moodboardId, userId },
  });
  await touchMoodboard(prisma, moodboardId);
}

async function requireAnyAccess(
  actor: MoodboardAccessActor,
  moodboardId: string
) {
  const access = await resolveMoodboardAccess(actor, moodboardId);
  if (!access || !actor.workspace) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  const moodboard = await prisma.moodboard.findFirst({
    where: {
      id: moodboardId,
      workspaceId: actor.workspace.workspaceId,
      archivedAt: null,
    },
    select: { id: true, createdById: true, workspaceId: true },
  });
  if (!moodboard) {
    throw new MoodboardAccessServiceError("MOODBOARD_NOT_FOUND", 404);
  }
  return moodboard;
}
