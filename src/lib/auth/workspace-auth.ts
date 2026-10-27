import type { NextRequest } from "next/server";

import { SubscriptionPlan, WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { ensurePersonalWorkspaceRow } from "@/lib/auth/personal-workspace";
import { getPlan } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export const WORKSPACES_FEATURE_FLAG = "workspaces";
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
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) {
    throw new WorkspaceAuthorizationError(
      "The authenticated user is no longer active.",
      401,
      "AUTHENTICATED_USER_NOT_FOUND"
    );
  }

  const personal = await ensurePersonalWorkspace(input.userId);
  const enabled = await isFeatureEnabled(WORKSPACES_FEATURE_FLAG, input.userId);
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
