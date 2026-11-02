import { prisma } from "@/lib/prisma";
import { enqueueTaskListSync } from "@/lib/queue/enqueue";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

import {
  STALE_TASK_MAPPING_BATCH,
  sweepStaleTaskMappings,
} from "@/worker/task-mapping-sweep";
import { syncTaskMapping } from "@/worker/task-mapping-sync";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueTaskListSync: jest.fn() }));
jest.mock("@/lib/google-oauth-scopes", () => ({
  GOOGLE_TASKS_SYNC_ENABLED: true,
}));
jest.mock("@/lib/task-sync/task-sync-manager", () => ({
  TaskSyncManager: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskListMapping: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}));

describe("stale task mapping sweep", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queues never-synced and stale mappings of Google and Outlook", async () => {
    (prisma.taskListMapping.findMany as jest.Mock).mockResolvedValue([
      { id: "m1" },
      { id: "m2" },
    ]);
    expect(await sweepStaleTaskMappings()).toBe(2);
    const args = (prisma.taskListMapping.findMany as jest.Mock).mock
      .calls[0][0];
    expect(args.take).toBe(STALE_TASK_MAPPING_BATCH);
    expect(args.where.AND[0].OR[0]).toEqual({ lastSyncedAt: null });
    expect(args.where.provider.OR).toHaveLength(2);
    expect(enqueueTaskListSync).toHaveBeenCalledWith("m1");
    expect(enqueueTaskListSync).toHaveBeenCalledWith("m2");
  });
});

describe("task mapping sync job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes an enabled mapping to the provider sync", async () => {
    const mapping = {
      id: "m1",
      syncEnabled: true,
      provider: { type: "GOOGLE", enabled: true, syncEnabled: true },
    };
    (prisma.taskListMapping.findUnique as jest.Mock).mockResolvedValue(mapping);
    const syncTaskList = jest.fn().mockResolvedValue({});
    (TaskSyncManager as jest.Mock).mockImplementation(() => ({ syncTaskList }));
    await syncTaskMapping("m1");
    expect(syncTaskList).toHaveBeenCalledWith(mapping);
  });

  it("skips a disabled mapping", async () => {
    (prisma.taskListMapping.findUnique as jest.Mock).mockResolvedValue({
      id: "m1",
      syncEnabled: false,
      provider: { enabled: true, syncEnabled: true },
    });
    await syncTaskMapping("m1");
    expect(TaskSyncManager).not.toHaveBeenCalled();
  });
});
