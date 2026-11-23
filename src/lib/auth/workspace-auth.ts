import type { NextRequest } from "next/server";

import { SubscriptionPlan, WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { ensurePersonalWorkspaceRow } from "@/lib/auth/personal-workspace";
import { getPlan } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { WORKSPACES } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";
import { createTtlCache } from "@/lib/ttl-cache";

export const WORKSPACES_FEATURE_FLAG = WORKSPACES;
export const WORKSPACE_HEADER = "x-workspace-id";

// These resources intentionally follow the user across workspace switches.
// Workspace-owned entities must use workspaceDataScopeWhere instead.
export const ACCOUNT_GLOBAL_RESOURCES = [
  "calendar-accounts",
  "connector-settings",
  "focus-history",
  "mail-accounts",
  "scheduling-preferences",
  "task-providers",
] as const;

const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.VIEWER]: 0,
  [WorkspaceRole.EDITOR]: 1,
  [WorkspaceRole.OWNER]: 2,
};

export type WorkspaceDataScope =
  | { mode: "legacy"; userId: string }
  | { mode: "workspace"; workspaceId: string };

export interface WorkspaceAccess {
  enabled: boolean;
  workspaceId: string;
  workspaceKind: WorkspaceKind;
  role: WorkspaceRole;
  dataScope: WorkspaceDataScope;
}

export function workspaceDataScopeWhere(
  access: WorkspaceAccess | undefined,
  legacyUserId: string
) {
  return access?.dataScope.mode === "workspace"
    ? { workspaceId: access.dataScope.workspaceId }
    : { userId: legacyUserId };
}

export class WorkspaceAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403,
    public readonly code:
      | "AUTHENTICATED_USER_NOT_FOUND"
      | "INVALID_WORKSPACE_REQUEST"
      | "WORKSPACE_ACCESS_DENIED"
      | "WORKSPACE_PAID_PLAN_REQUIRED"
      | "WORKSPACE_ROLE_REQUIRED"
  ) {
    super(message);
    this.name = "WorkspaceAuthorizationError";
  }
}

export function requestedWorkspaceId(request: NextRequest): string | undefined {
  const headerId = request.headers.get(WORKSPACE_HEADER)?.trim() || undefined;
  const queryId =
    request.nextUrl.searchParams.get("workspaceId")?.trim() || undefined;

  if (headerId && queryId && headerId !== queryId) {
    throw new WorkspaceAuthorizationError(
      "Conflicting workspace identifiers.",
      400,
      "INVALID_WORKSPACE_REQUEST"
    );
  }

  return headerId ?? queryId;
}

function isUniqueConstraintRace(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * The id and kind of a person's personal workspace never change once it
 * exists, so they are kept for 60 s per person. Only the workspace row is
 * cached: whether the person is active and still owns it is read every call.
 */
export const PERSONAL_WORKSPACE_CACHE_TTL_MS = 60_000;
const personalWorkspaceCache = createTtlCache<{
  id: string;
  kind: WorkspaceKind;
} | null>({
  name: "personal-workspace",
  ttlMs: PERSONAL_WORKSPACE_CACHE_TTL_MS,
});

function personalWorkspaceRow(userId: string) {
  return personalWorkspaceCache.get(userId, async () => {
    const found = await prisma.workspace.findUnique({
      where: { personalOwnerId: userId },
      select: { id: true, kind: true },
    });
    // A missing row is not remembered: it is created right after.
    if (!found) personalWorkspaceCache.delete(userId);
    return found;
  });
}

/**
 * Read-only: the personal workspace with the person's OWNER membership, or
 * null when either is missing (the writing path below then creates it). It
 * never writes, so it is safe to run before the person is known to be active.
 */
async function readPersonalWorkspace(userId: string) {
  const workspace = await personalWorkspaceRow(userId);
  if (!workspace) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    select: { role: true },
  });
  if (membership?.role !== WorkspaceRole.OWNER) return null;
  return { ...workspace, role: membership.role };
}

async function ensurePersonalWorkspace(userId: string) {
  const workspace = await ensurePersonalWorkspaceRow(userId);
  let membership;
  try {
    membership = await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId },
      },
      update: { role: WorkspaceRole.OWNER },
      create: {
        workspaceId: workspace.id,
        userId,
        role: WorkspaceRole.OWNER,
      },
      select: { role: true },
    });
  } catch (error) {
    if (!isUniqueConstraintRace(error)) throw error;
    membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId },
      },
      select: { role: true },
    });
    if (!membership) throw error;
  }
  return { ...workspace, role: membership.role };
}

function requireRole(access: WorkspaceAccess, requiredRole: WorkspaceRole) {
  if (ROLE_RANK[access.role] < ROLE_RANK[requiredRole]) {
    throw new WorkspaceAuthorizationError(
      "The requested workspace role is required.",
      403,
      "WORKSPACE_ROLE_REQUIRED"
    );
  }
  return access;
}

export async function resolveWorkspaceAccess(input: {
  userId: string;
  requestedWorkspaceId?: string;
  requiredRole?: WorkspaceRole;
}): Promise<WorkspaceAccess> {
  // Independent reads, run together. The personal workspace read does not
  // write; a missing workspace or membership is created only after the
  // person is known to be active, so a deactivated user is refused first.
  const [user, enabled, existing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true },
    }),
    isFeatureEnabled(WORKSPACES_FEATURE_FLAG, input.userId),
    readPersonalWorkspace(input.userId),
  ]);
  if (!user?.isActive) {
    throw new WorkspaceAuthorizationError(
      "The authenticated user is no longer active.",
      401,
      "AUTHENTICATED_USER_NOT_FOUND"
    );
  }

  if (!existing) {
    // The cached workspace may be gone or replaced (no OWNER membership in
    // it): forget it, and let the writing path find or create the real one.
    personalWorkspaceCache.delete(input.userId);
  }
  const personal = existing ?? (await ensurePersonalWorkspace(input.userId));
  const requiredRole = input.requiredRole ?? WorkspaceRole.VIEWER;

  if (!enabled) {
    return requireRole(
      {
        enabled: false,
        workspaceId: personal.id,
        workspaceKind: personal.kind,
        role: personal.role,
        dataScope: { mode: "legacy", userId: input.userId },
      },
      requiredRole
    );
  }

  const workspaceId = input.requestedWorkspaceId ?? personal.id;
  if (workspaceId === personal.id) {
    return requireRole(
      {
        enabled: true,
        workspaceId: personal.id,
        workspaceKind: personal.kind,
        role: personal.role,
        dataScope: { mode: "workspace", workspaceId: personal.id },
      },
      requiredRole
    );
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: input.userId },
    },
    select: {
      role: true,
      workspace: { select: { id: true, kind: true } },
    },
  });
  if (!membership) {
    throw new WorkspaceAuthorizationError(
      "Workspace access denied.",
      403,
      "WORKSPACE_ACCESS_DENIED"
    );
  }
  const plan = await getPlan(input.userId);
  if (
    membership.workspace.kind === WorkspaceKind.SHARED &&
    plan !== SubscriptionPlan.PRO &&
    plan !== SubscriptionPlan.LIFETIME
  ) {
    throw new WorkspaceAuthorizationError(
      "A paid plan is required for shared workspace access.",
      403,
      "WORKSPACE_PAID_PLAN_REQUIRED"
    );
  }

  return requireRole(
    {
      enabled: true,
      workspaceId: membership.workspace.id,
      workspaceKind: membership.workspace.kind,
      role: membership.role,
      dataScope: {
        mode: "workspace",
        workspaceId: membership.workspace.id,
      },
    },
    requiredRole
  );
}
