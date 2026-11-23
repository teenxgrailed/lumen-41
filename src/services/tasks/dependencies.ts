import { Prisma } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { kindWhere } from "@/lib/tasks/open-task";

interface DependencyScope {
  userId: string;
  workspace?: WorkspaceAccess;
}

export class TaskDependencyError extends Error {
  constructor(
    public readonly code:
      | "TASK_NOT_FOUND"
      | "PROJECT_REQUIRED"
      | "CROSS_PROJECT_DEPENDENCY"
      | "PROJECT_ARCHIVED"
      | "SELF_DEPENDENCY"
      | "DUPLICATE_DEPENDENCY"
      | "DEPENDENCY_CYCLE"
  ) {
    super(code);
    this.name = "TaskDependencyError";
  }
}

export function wouldCreateDependencyCycle(
  edges: Array<{ blockerTaskId: string; blockedTaskId: string }>,
  blockerTaskId: string,
  blockedTaskId: string
) {
  if (blockerTaskId === blockedTaskId) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const next = outgoing.get(edge.blockerTaskId) ?? [];
    next.push(edge.blockedTaskId);
    outgoing.set(edge.blockerTaskId, next);
  }
  const pending = [blockedTaskId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === blockerTaskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export async function listTaskDependencies(
  scope: DependencyScope,
  taskId: string
) {
  // Another member's idea stays private to its owner.
  const taskScope = {
    ...workspaceDataScopeWhere(scope.workspace, scope.userId),
    ...kindWhere("any", scope.userId),
  };
  const dependencyScope = workspaceDataScopeWhere(
    scope.workspace,
    scope.userId
  );
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...taskScope },
    select: { id: true },
  });
  if (!task) throw new TaskDependencyError("TASK_NOT_FOUND");

  const [blocks, blockedBy] = await Promise.all([
    prisma.taskDependency.findMany({
      where: {
        ...dependencyScope,
        blockerTaskId: taskId,
        removedAt: null,
        blocker: { is: taskScope },
        blocked: { is: taskScope },
      },
      include: {
        blocked: {
          select: { id: true, title: true, status: true, projectId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskDependency.findMany({
      where: {
        ...dependencyScope,
        blockedTaskId: taskId,
        removedAt: null,
        blocker: { is: taskScope },
        blocked: { is: taskScope },
      },
      include: {
        blocker: {
          select: { id: true, title: true, status: true, projectId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    blocks: blocks.map(({ id, blocked }) => ({
      dependencyId: id,
      task: blocked,
    })),
    blockedBy: blockedBy.map(({ id, blocker }) => ({
      dependencyId: id,
      task: blocker,
    })),
  };
}

export async function addTaskDependency(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  blockerTaskId: string;
  blockedTaskId: string;
}) {
  if (input.blockerTaskId === input.blockedTaskId) {
    throw new TaskDependencyError("SELF_DEPENDENCY");
  }

  const taskScope = {
    ...workspaceDataScopeWhere(input.workspace, input.userId),
    ...kindWhere("any", input.userId),
  };
  const tasks = await prisma.task.findMany({
    where: {
      ...taskScope,
      id: { in: [input.blockerTaskId, input.blockedTaskId] },
    },
    select: {
      id: true,
      projectId: true,
      workspaceId: true,
      project: { select: { status: true } },
    },
  });
  if (tasks.length !== 2) throw new TaskDependencyError("TASK_NOT_FOUND");
  if (tasks.some((task) => !task.projectId)) {
    throw new TaskDependencyError("PROJECT_REQUIRED");
  }
  const projectId = tasks[0].projectId!;
  if (tasks.some((task) => task.projectId !== projectId)) {
    throw new TaskDependencyError("CROSS_PROJECT_DEPENDENCY");
  }
  if (tasks.some((task) => task.project?.status === "archived")) {
    throw new TaskDependencyError("PROJECT_ARCHIVED");
  }
  const workspaceId = input.workspace?.workspaceId ?? tasks[0].workspaceId;
  if (!workspaceId) throw new TaskDependencyError("TASK_NOT_FOUND");

  const edges = await prisma.taskDependency.findMany({
    where: {
      ...workspaceDataScopeWhere(input.workspace, input.userId),
      removedAt: null,
      blocker: { is: { projectId } },
      blocked: { is: { projectId } },
    },
    select: { blockerTaskId: true, blockedTaskId: true },
  });
  // The new edge is blocker -> blocked. It creates a cycle when blocker is
  // already reachable from blocked.
  if (
    wouldCreateDependencyCycle(edges, input.blockerTaskId, input.blockedTaskId)
  ) {
    throw new TaskDependencyError("DEPENDENCY_CYCLE");
  }

  try {
    return await prisma.taskDependency.upsert({
      where: {
        blockerTaskId_blockedTaskId: {
          blockerTaskId: input.blockerTaskId,
          blockedTaskId: input.blockedTaskId,
        },
      },
      update: {
        workspaceId,
        removedAt: null,
      },
      create: {
        userId: input.userId,
        workspaceId,
        blockerTaskId: input.blockerTaskId,
        blockedTaskId: input.blockedTaskId,
      },
      include: {
        blocker: { select: { id: true, title: true, status: true } },
        blocked: { select: { id: true, title: true, status: true } },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TaskDependencyError("DUPLICATE_DEPENDENCY");
    }
    throw error;
  }
}

export async function removeTaskDependency(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  dependencyId: string;
}) {
  const removed = await prisma.taskDependency.updateMany({
    where: {
      id: input.dependencyId,
      removedAt: null,
      ...workspaceDataScopeWhere(input.workspace, input.userId),
    },
    data: { removedAt: newDate() },
  });
  if (removed.count === 0) throw new TaskDependencyError("TASK_NOT_FOUND");
}

export async function findTaskProjectMoveConflict(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  taskId: string;
  targetProjectId: string | null;
}) {
  const dependencies = await prisma.taskDependency.findMany({
    where: {
      ...workspaceDataScopeWhere(input.workspace, input.userId),
      removedAt: null,
      OR: [{ blockerTaskId: input.taskId }, { blockedTaskId: input.taskId }],
    },
    select: {
      id: true,
      blockerTaskId: true,
      blocker: { select: { id: true, title: true, projectId: true } },
      blocked: { select: { id: true, title: true, projectId: true } },
    },
  });

  for (const dependency of dependencies) {
    const other =
      dependency.blockerTaskId === input.taskId
        ? dependency.blocked
        : dependency.blocker;
    if (other.projectId !== input.targetProjectId) {
      return { dependencyId: dependency.id, task: other };
    }
  }
  return null;
}
