import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { enqueueTaskListSync, isQueueConfigured } from "@/lib/queue/enqueue";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1", workspace: null }),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({}),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueTaskListSync: jest.fn(),
  isQueueConfigured: jest.fn(),
}));
jest.mock("@/lib/task-sync/task-sync-manager", () => ({
  TaskSyncManager: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskProvider: { findUnique: jest.fn() },
    project: { findFirst: jest.fn() },
    taskListMapping: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

function request() {
  return new NextRequest("http://localhost/api/task-sync/mappings", {
    method: "POST",
    body: JSON.stringify({
      providerId: "p1",
      externalListId: "l1",
      externalListName: "My tasks",
      projectId: "proj1",
    }),
  });
}

describe("task list mapping first sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.taskProvider.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      enabled: true,
      syncEnabled: true,
    });
    (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: "proj1" });
    (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.taskListMapping.create as jest.Mock).mockResolvedValue({
      id: "m1",
      providerId: "p1",
      syncEnabled: true,
      provider: { name: "Google", type: "GOOGLE" },
      project: { name: "P", color: null },
    });
  });

  it("enqueues the first sync when the queue is configured", async () => {
    (isQueueConfigured as jest.Mock).mockReturnValue(true);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(enqueueTaskListSync).toHaveBeenCalledWith("m1");
    expect(TaskSyncManager).not.toHaveBeenCalled();
  });

  it("runs it in the background without a queue", async () => {
    (isQueueConfigured as jest.Mock).mockReturnValue(false);
    const syncTaskList = jest.fn().mockResolvedValue({});
    (TaskSyncManager as jest.Mock).mockImplementation(() => ({ syncTaskList }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(enqueueTaskListSync).not.toHaveBeenCalled();
    expect(syncTaskList).toHaveBeenCalledWith("m1");
  });
});
