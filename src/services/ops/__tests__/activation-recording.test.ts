import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import { getMailMessage } from "@/lib/mail-db";

import { runOp } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, WORKSPACE_ID, access, opts, seedTask } from "./harness";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canUseGoals: jest.fn().mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  }),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;
const record = recordActivation as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

describe("schedule.auto", () => {
  it("records plan_applied (and only that) when the scheduler moved something", async () => {
    const task = await seedTask(db);
    jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
      await (
        db.client.task as unknown as {
          update: (args: unknown) => Promise<unknown>;
        }
      ).update({
        where: { id: task.id },
        data: {
          scheduledStart: new Date("2026-10-06T13:00:00.000Z"),
          scheduledEnd: new Date("2026-10-06T14:00:00.000Z"),
        },
      });
      return [];
    });
    await runOp("schedule.auto", {}, opts());
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("plan_applied", OWNER_ID, {
      source: "agent",
    });
    expect(record).not.toHaveBeenCalledWith(
      "replan_shown",
      expect.anything(),
      expect.anything()
    );
    expect(record).not.toHaveBeenCalledWith(
      "keep_applied",
      expect.anything(),
      expect.anything()
    );
  });

  it("records nothing when the scheduler changed nothing", async () => {
    await seedTask(db);
    jest.mocked(scheduleAllTasksForUser).mockResolvedValue([] as never);
    await runOp("schedule.auto", {}, opts());
    expect(record).not.toHaveBeenCalled();
  });
});

describe("mail.to_task", () => {
  it("records task_created with the actor as source after the task is written", async () => {
    jest.mocked(getMailMessage).mockResolvedValue({
      id: "m1",
      subject: "Invoice",
      fromName: "Ana",
      fromAddress: "ana@example.com",
      snippet: "Please pay",
    } as never);
    await runOp("mail.to_task", { messageId: "m1" }, opts());
    expect(record).toHaveBeenCalledWith("task_created", OWNER_ID, {
      source: "agent",
    });
  });

  it("records nothing when the message does not exist", async () => {
    jest.mocked(getMailMessage).mockResolvedValue(null as never);
    await expect(
      runOp("mail.to_task", { messageId: "nope" }, opts())
    ).rejects.toBeDefined();
    expect(record).not.toHaveBeenCalled();
  });
});

describe("goal.convert_from_task", () => {
  it("records task_created once when it writes task rows from the parts", async () => {
    const task = await seedTask(db, { title: "GOAL: Save" });
    await db.seed("taskPart", {
      taskId: task.id,
      title: "Open an account",
      position: 1,
    });
    await db.seed("taskPart", {
      taskId: task.id,
      title: "Set a transfer",
      position: 2,
    });
    await runOp("goal.convert_from_task", { taskId: task.id }, opts());
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("task_created", OWNER_ID, {
      source: "agent",
    });
  });

  it("records nothing when the task has no parts to turn into tasks", async () => {
    const task = await seedTask(db, { title: "GOAL: Empty" });
    await runOp("goal.convert_from_task", { taskId: task.id }, opts());
    expect(record).not.toHaveBeenCalled();
  });
});
