import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";
import { SchedulingRunSource, SchedulingRunStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { repushDirtyBlocks } from "@/lib/task-block-push";

import { AutoScheduleSettingsMissingError } from "../errors";
import { executeSchedulingRun } from "../runs";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn() },
    schedulingRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({ repushDirtyBlocks: jest.fn() }));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));

describe("executeSchedulingRun", () => {
  it("persists the engine's exact unscheduled reason codes", async () => {
    const taskFindMany = prisma.task.findMany as jest.Mock;
    const runFindUnique = prisma.schedulingRun.findUnique as jest.Mock;
    const runUpdate = prisma.schedulingRun.update as jest.Mock;
    runFindUnique.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      source: SchedulingRunSource.MANUAL,
      status: SchedulingRunStatus.QUEUED,
    });
    taskFindMany.mockResolvedValue([]);
    jest.mocked(scheduleAllTasksForUserDetailed).mockResolvedValue({
      tasks: [],
      scheduleResult: {
        blocks: [],
        frozenBlocks: [],
        unscheduled: [
          {
            taskId: "task-1",
            title: "Strict task",
            reason: "HARD_DEADLINE_MISSED",
          },
        ],
      },
    });
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "run-1", userId: "user-1", ...data })
    );

    await executeSchedulingRun("run-1");

    expect(runUpdate).toHaveBeenLastCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: SchedulingRunStatus.SUCCEEDED,
        unscheduled: [{ taskId: "task-1", reason: "HARD_DEADLINE_MISSED" }],
      }),
    });
    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeId: "user-1",
          workspaceId: "workspace-1",
          isArchived: false,
          AND: [
            {
              OR: [
                { projectId: null },
                { project: { is: { status: "active" } } },
              ],
            },
          ],
        }),
      })
    );
    expect(scheduleAllTasksForUserDetailed).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
    });
    expect(repushDirtyBlocks).toHaveBeenCalledWith("user-1", "workspace-1");
  });

  it("closes the run as a no-op success for a person without auto-schedule settings, so the job does not retry", async () => {
    const runUpdate = prisma.schedulingRun.update as jest.Mock;
    (prisma.schedulingRun.findUnique as jest.Mock).mockResolvedValue({
      id: "run-2",
      userId: "user-2",
      workspaceId: null,
      source: SchedulingRunSource.CRON,
      status: SchedulingRunStatus.QUEUED,
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    jest
      .mocked(scheduleAllTasksForUserDetailed)
      .mockRejectedValue(new AutoScheduleSettingsMissingError());
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "run-2", userId: "user-2", ...data })
    );

    await expect(executeSchedulingRun("run-2")).resolves.toEqual(
      expect.objectContaining({ status: SchedulingRunStatus.SUCCEEDED })
    );
    expect(runUpdate).toHaveBeenLastCalledWith({
      where: { id: "run-2" },
      data: expect.objectContaining({
        status: SchedulingRunStatus.SUCCEEDED,
        changedTaskCount: 0,
      }),
    });
  });

  it("still fails the run and rethrows on any other error", async () => {
    const runUpdate = prisma.schedulingRun.update as jest.Mock;
    (prisma.schedulingRun.findUnique as jest.Mock).mockResolvedValue({
      id: "run-3",
      userId: "user-3",
      workspaceId: null,
      source: SchedulingRunSource.CRON,
      status: SchedulingRunStatus.QUEUED,
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    jest
      .mocked(scheduleAllTasksForUserDetailed)
      .mockRejectedValue(new Error("db down"));
    runUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "run-3", userId: "user-3", ...data })
    );

    await expect(executeSchedulingRun("run-3")).rejects.toThrow("db down");
    expect(runUpdate).toHaveBeenLastCalledWith({
      where: { id: "run-3" },
      data: expect.objectContaining({ status: SchedulingRunStatus.FAILED }),
    });
  });
});
