import { recordActivation } from "@/lib/activation-events";
import { prisma } from "@/lib/prisma";

import { createPrismaImportStore } from "../prisma-store";
import type { PlannedTask } from "../types";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
  },
}));

const store = () =>
  createPrismaImportStore({
    userId: "user-1",
    workspaceId: "ws-1",
    source: "todoist",
    importRunId: "run-1",
  });

const task = { title: "Buy milk", externalId: "x1" } as unknown as PlannedTask;
const refs = { projectId: null, stageId: null, tagIds: [] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.task.create).mockResolvedValue({ id: "t1" } as never);
  jest.mocked(prisma.task.update).mockResolvedValue({ id: "t1" } as never);
});

describe("import store activation", () => {
  it("records task_created once per run, however many rows it creates", async () => {
    const s = store();
    await s.writeTask(null, task, refs);
    await s.writeTask(null, task, refs);
    await s.writeTask(null, task, refs);
    expect(prisma.task.create).toHaveBeenCalledTimes(3);
    expect(recordActivation).toHaveBeenCalledTimes(1);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "import",
    });
  });

  it("records nothing when a row only updates an existing task", async () => {
    jest.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t1" } as never);
    await store().writeTask("t1", task, refs);
    expect(prisma.task.update).toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(recordActivation).not.toHaveBeenCalled();
  });

  it("records nothing when the create fails", async () => {
    jest.mocked(prisma.task.create).mockRejectedValue(new Error("db"));
    await expect(store().writeTask(null, task, refs)).rejects.toThrow("db");
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
