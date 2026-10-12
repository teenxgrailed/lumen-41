import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import { createFakePrisma } from "./fake-prisma";

export const OWNER_ID = "user-1";
export const OTHER_ID = "user-2";
export const WORKSPACE_ID = "ws-1";

export function access(
  role: WorkspaceRole = WorkspaceRole.OWNER,
  workspaceId = WORKSPACE_ID
): WorkspaceAccess {
  return {
    enabled: true,
    workspaceId,
    workspaceKind: WorkspaceKind.PERSONAL,
    role,
    dataScope: { mode: "workspace", workspaceId },
  };
}

export function opts(
  role: WorkspaceRole = WorkspaceRole.OWNER,
  userId = OWNER_ID
) {
  return { userId, workspace: access(role), actor: "agent" as const };
}

export type FakeDb = ReturnType<typeof createFakePrisma>;

export async function seedTask(
  db: FakeDb,
  fields: Record<string, unknown> = {}
) {
  return db.seed("task", {
    title: "Write report",
    userId: OWNER_ID,
    assigneeId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    ...fields,
  }) as Promise<Record<string, unknown> & { id: string; updatedAt: Date }>;
}

/** Bumps a row the way another writer would, outside any op. */
export async function touchRow(
  db: FakeDb,
  model: "task" | "project",
  id: string,
  data: Record<string, unknown>
) {
  const delegate = db.client[model] as {
    update: (args: unknown) => Promise<unknown>;
  };
  await delegate.update({ where: { id }, data });
}

export function taskRow(db: FakeDb, id: string) {
  return db.tables.task.find((row) => row.id === id)!;
}
