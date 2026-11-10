import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
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
jest.mock("@/lib/task-sync/task-sync-manager", () => ({
  TaskSyncManager: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskProvider: { findFirst: jest.fn() },
    taskListMapping: { findFirst: jest.fn(), findMany: jest.fn() },
  },
}));

const syncTaskList = jest.fn();

function req(body: unknown) {
  return new NextRequest("http://localhost/api/task-sync/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/task-sync/sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TaskSyncManager as jest.Mock).mockImplementation(() => ({
      syncTaskList,
    }));
    (prisma.taskProvider.findFirst as jest.Mock).mockResolvedValue({
      id: "p1",
    });
    (prisma.taskListMapping.findMany as jest.Mock).mockResolvedValue([
      { id: "m1" },
      { id: "m2" },
    ]);
    (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      direction: "bidirectional",
    });
  });

  it("reports failure when every mapping threw", async () => {
    syncTaskList.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ providerId: "p1" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(json.result.errors).toHaveLength(2);
  });

  it("marks success false when one of two mappings threw", async () => {
    syncTaskList
      .mockResolvedValueOnce({
        success: true,
        imported: 1,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: [],
      })
      .mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req({ providerId: "p1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.success).toBe(false);
    expect(json.result.errors[0].error).toBe("boom");
  });

  it("passes the requested direction to the manager", async () => {
    syncTaskList.mockResolvedValue({
      success: true,
      imported: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
    });
    await POST(req({ mappingId: "m1", direction: "incoming" }));
    expect(syncTaskList).toHaveBeenCalledWith(expect.anything(), {
      direction: "incoming",
    });
  });

  it("refuses outgoing-only instead of running a full sync", async () => {
    const res = await POST(req({ mappingId: "m1", direction: "outgoing" }));
    expect(res.status).toBe(400);
    expect(syncTaskList).not.toHaveBeenCalled();
  });
});
