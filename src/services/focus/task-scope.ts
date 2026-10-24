import { type Prisma, WorkspaceRole } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

/** The task a focus call names is not one the caller may work on. */
export class FocusTaskNotFoundError extends Error {
  constructor() {
    super("TASK_NOT_FOUND");
    this.name = "FocusTaskNotFoundError";
  }
}

/**
 * Which tasks a focus call may touch: the `workspaceDataScopeWhere` of the
 * request, or null when the caller may edit none (a viewer). A session
 * records time on its task and can close it, so a task id from the client is
 * only used after it is found inside this scope.
 */
export type FocusTaskScope = Prisma.TaskWhereInput | null;

/**
 * The task scope of a request: its workspace's data scope, or null for a
 * viewer. Touching a task through focus is a task write, so it needs the same
 * editor seat the task routes ask for; the timer itself (a session with no
 * task) stays open to every member.
 */
export function focusTaskScope(
  workspace: WorkspaceAccess | undefined,
  userId: string
): FocusTaskScope {
  if (workspace?.role === WorkspaceRole.VIEWER) return null;
  return workspaceDataScopeWhere(workspace, userId);
}

/** The id of a task inside `scope`, or null (also when there is no scope). */
export async function scopedTaskId(
  taskId: string,
  scope: FocusTaskScope
): Promise<string | null> {
  if (!scope) return null;
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...scope },
    select: { id: true },
  });
  return task?.id ?? null;
}
