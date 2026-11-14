import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";

import * as taskRoute from "@/app/api/tasks/[id]/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    scheduledBlock: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    taskListMapping: { findFirst: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));

const taskModel = prisma.task as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
};

function recurringMaster() {
  return {
    id: "series-1",
    userId: "user-1",
    title: "Daily planning",
    description: null,
    status: "todo",
    isArchived: false,
    isRecurring: true,
    recurrenceRule: "DTSTART:20260804T000000Z\nRRULE:FREQ=DAILY;COUNT=4",
    recurrenceMasterId: null,
    recurrenceInstanceAt: null,
    dueDate: new Date("2026-08-04T00:00:00.000Z"),
    startDate: new Date("2026-08-04T00:00:00.000Z"),
    duration: 30,
    estimatedMinutes: 30,
    estOptimistic: null,
    estLikely: null,
    estPessimistic: null,
    minChunkMinutes: null,
    maxChunkMinutes: null,
    deadline: null,
    hardDeadline: false,
    energyRequired: "MEDIUM",
    priorityLevel: "MEDIUM",
    contextTag: null,
    priority: "none",
    energyLevel: "medium",
    preferredTime: null,
    projectId: null,
    scheduleId: null,
    tags: [],
  };
}

function completionRequest() {
  return new NextRequest("http://localhost/api/tasks/series-1", {
    method: "PUT",
    body: JSON.stringify({ status: "completed" }),
  });
}

describe("task recurrence instances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "user-1" });
    (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it("uses the master and occurrence unique key under concurrent completion", async () => {
    const master = recurringMaster();
    const instances = new Map<string, unknown>();
    const transactionTask = {
      upsert: jest.fn(async ({ where, create }) => {
        const key = `${where.recurrenceMasterId_recurrenceInstanceAt.recurrenceMasterId}:${where.recurrenceMasterId_recurrenceInstanceAt.recurrenceInstanceAt.toISOString()}`;
        if (!instances.has(key)) instances.set(key, create);
        return instances.get(key);
      }),
      update: jest.fn(async ({ data }) => ({
        ...master,
        ...data,
        tags: [],
        project: null,
        scheduledBlocks: [],
      })),
    };
    taskModel.findUnique.mockResolvedValue(master);
    // Completing a repeating counter also unticks its unnamed parts (plan 11 T-1).
    const transactionPart = { updateMany: jest.fn() };
    (prisma.$transaction as jest.Mock).mockImplementation(
      (
        callback: (client: {
          task: typeof transactionTask;
          taskPart: typeof transactionPart;
        }) => unknown
      ) => callback({ task: transactionTask, taskPart: transactionPart })
    );

    const [first, second] = await Promise.all([
      taskRoute.PUT(completionRequest(), {
        params: Promise.resolve({ id: master.id }),
      }),
      taskRoute.PUT(completionRequest(), {
        params: Promise.resolve({ id: master.id }),
      }),
    ]);

    expect(first!.status).toBe(200);
    expect(second!.status).toBe(200);
    expect(instances.size).toBe(1);
    expect(transactionTask.upsert).toHaveBeenCalledTimes(2);
    expect(transactionTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recurrenceMasterId: master.id,
          recurrenceInstanceAt: master.dueDate,
          status: "completed",
          isRecurring: false,
        }),
      })
    );
  });

  it("completes an explicit instance without rewriting its master", async () => {
    const instance = {
      ...recurringMaster(),
      id: "instance-1",
      isRecurring: false,
      recurrenceRule: null,
      recurrenceMasterId: "series-1",
      recurrenceInstanceAt: new Date("2026-08-04T00:00:00.000Z"),
    };
    taskModel.findUnique.mockResolvedValue(instance);
    taskModel.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...instance,
        ...data,
        tags: [],
        project: null,
        scheduledBlocks: [],
      })
    );

    const response = await taskRoute.PUT(completionRequest(), {
      params: Promise.resolve({ id: instance.id }),
    });

    expect(response!.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(taskModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: instance.id, userId: "user-1" } })
    );
  });

  it("enforces occurrence identity in an additive migration", () => {
    const migration = readFileSync(
      "prisma/migrations/20260804120000_task_recurrence_instances/migration.sql",
      "utf8"
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Task_recurrenceMasterId_recurrenceInstanceAt_key"'
    );
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).not.toMatch(/DELETE FROM|DROP TABLE|DROP COLUMN/);
  });
});
