import {
  TaskDependencyError,
  addTaskDependency,
  findTaskProjectMoveConflict,
  listTaskDependencies,
  removeTaskDependency,
  wouldCreateDependencyCycle,
} from "@/services/tasks/dependencies";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn(), findMany: jest.fn() },
    taskDependency: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const taskModel = prisma.task as unknown as {
  findFirst: jest.Mock;
  findMany: jest.Mock;
};
const dependencyModel = prisma.taskDependency as unknown as {
  findMany: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
};
const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: "SHARED" as const,
  role: "EDITOR" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

describe("task dependency cycle detection", () => {
  const edges = [
    { blockerTaskId: "a", blockedTaskId: "b" },
    { blockerTaskId: "b", blockedTaskId: "c" },
  ];

  it("rejects self references and transitive cycles", () => {
    expect(wouldCreateDependencyCycle(edges, "a", "a")).toBe(true);
    expect(wouldCreateDependencyCycle(edges, "c", "a")).toBe(true);
  });

  it("allows a new acyclic branch", () => {
    expect(wouldCreateDependencyCycle(edges, "a", "d")).toBe(false);
    expect(wouldCreateDependencyCycle(edges, "d", "c")).toBe(false);
  });
});

describe("project-scoped task dependencies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    taskModel.findMany.mockResolvedValue([
      {
        id: "blocker",
        projectId: "project-1",
        workspaceId: "workspace-1",
        project: { status: "active" },
      },
      {
        id: "blocked",
        projectId: "project-1",
        workspaceId: "workspace-1",
        project: { status: "active" },
      },
    ]);
    dependencyModel.findMany.mockResolvedValue([]);
    dependencyModel.upsert.mockResolvedValue({ id: "dependency-1" });
  });

  it("creates or restores a dependency only inside one project", async () => {
    await addTaskDependency({
      userId: "user-1",
      workspace,
      blockerTaskId: "blocker",
      blockedTaskId: "blocked",
    });

    expect(dependencyModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { workspaceId: "workspace-1", removedAt: null },
        create: expect.objectContaining({
          userId: "user-1",
          workspaceId: "workspace-1",
        }),
      })
    );
  });

  it("rejects new cross-project and projectless dependencies", async () => {
    taskModel.findMany.mockResolvedValueOnce([
      {
        id: "blocker",
        projectId: "project-1",
        workspaceId: "workspace-1",
        project: { status: "active" },
      },
      {
        id: "blocked",
        projectId: "project-2",
        workspaceId: "workspace-1",
        project: { status: "active" },
      },
    ]);
    await expect(
      addTaskDependency({
        userId: "user-1",
        workspace,
        blockerTaskId: "blocker",
        blockedTaskId: "blocked",
      })
    ).rejects.toMatchObject({ code: "CROSS_PROJECT_DEPENDENCY" });

    taskModel.findMany.mockResolvedValueOnce([
      {
        id: "blocker",
        projectId: null,
        workspaceId: "workspace-1",
        project: null,
      },
      {
        id: "blocked",
        projectId: null,
        workspaceId: "workspace-1",
        project: null,
      },
    ]);
    await expect(
      addTaskDependency({
        userId: "user-1",
        workspace,
        blockerTaskId: "blocker",
        blockedTaskId: "blocked",
      })
    ).rejects.toMatchObject({ code: "PROJECT_REQUIRED" });
  });

  it("keeps legacy cross-project links readable and soft-removable", async () => {
    taskModel.findFirst.mockResolvedValue({ id: "blocker" });
    dependencyModel.findMany
      .mockResolvedValueOnce([
        {
          id: "dependency-1",
          blocked: {
            id: "blocked",
            title: "Other project task",
            status: "todo",
            projectId: "project-2",
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const listed = await listTaskDependencies(
      { userId: "user-1", workspace },
      "blocker"
    );
    expect(listed.blocks[0].task.projectId).toBe("project-2");

    dependencyModel.updateMany.mockResolvedValue({ count: 1 });
    await removeTaskDependency({
      userId: "user-1",
      workspace,
      dependencyId: "dependency-1",
    });
    expect(dependencyModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace-1" }),
        data: { removedAt: expect.any(Date) },
      })
    );
  });

  it("rejects cross-workspace dependency reads before querying edges", async () => {
    taskModel.findFirst.mockResolvedValue(null);

    await expect(
      listTaskDependencies({ userId: "user-1", workspace }, "outside-task")
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(taskModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "outside-task",
          workspaceId: "workspace-1",
          NOT: { kind: "IDEA", userId: { not: "user-1" } },
        },
      })
    );
    expect(dependencyModel.findMany).not.toHaveBeenCalled();
  });

  it("names the conflicting task when a move crosses a dependency", async () => {
    dependencyModel.findMany.mockResolvedValue([
      {
        id: "dependency-1",
        blockerTaskId: "moving",
        blocker: { id: "moving", title: "Moving", projectId: "project-1" },
        blocked: {
          id: "linked",
          title: "Linked task",
          projectId: "project-1",
        },
      },
    ]);

    await expect(
      findTaskProjectMoveConflict({
        userId: "user-1",
        workspace,
        taskId: "moving",
        targetProjectId: "project-2",
      })
    ).resolves.toEqual({
      dependencyId: "dependency-1",
      task: {
        id: "linked",
        title: "Linked task",
        projectId: "project-1",
      },
    });
  });

  it("preserves the typed dependency errors", () => {
    expect(new TaskDependencyError("PROJECT_REQUIRED").code).toBe(
      "PROJECT_REQUIRED"
    );
  });
});
