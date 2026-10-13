import { MoodboardAccessRole, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

export type MoodboardAccessActor = {
  userId: string;
  workspace?: WorkspaceAccess;
};

const ROLE_RANK: Record<MoodboardAccessRole, number> = {
  [MoodboardAccessRole.VIEWER]: 0,
  [MoodboardAccessRole.EDITOR]: 1,
  [MoodboardAccessRole.FULL_ACCESS]: 2,
};

export function inheritedMoodboardRole(
  role: WorkspaceRole
): MoodboardAccessRole {
  if (role === WorkspaceRole.OWNER) return MoodboardAccessRole.FULL_ACCESS;
  if (role === WorkspaceRole.EDITOR) return MoodboardAccessRole.EDITOR;
  return MoodboardAccessRole.VIEWER;
}

export async function resolveMoodboardAccess(
  actor: MoodboardAccessActor,
  moodboardId: string,
  requiredRole: MoodboardAccessRole = MoodboardAccessRole.VIEWER
) {
  if (!actor.workspace) return null;
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
      trashedAt: true,
      accessGrants: {
        where: { userId: actor.userId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!moodboard) return null;

  const directRole = moodboard.accessGrants[0]?.role;
  const role =
    moodboard.createdById === actor.userId
      ? MoodboardAccessRole.FULL_ACCESS
      : (directRole ?? inheritedMoodboardRole(actor.workspace.role));
  if (ROLE_RANK[role] < ROLE_RANK[requiredRole]) return null;
  // A board in Trash is read-only; restoring it is the one write allowed.
  return {
    moodboardId: moodboard.id,
    role,
    trashed: moodboard.trashedAt != null,
  };
}

export function moodboardRoleAtLeast(
  role: MoodboardAccessRole,
  requiredRole: MoodboardAccessRole
) {
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole];
}
