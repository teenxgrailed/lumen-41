import { WorkspaceRole } from "@prisma/client";

import { listOps, runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OTHER_ID, OWNER_ID, access, opts, seedTask, taskRow } from "./harness";

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
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId)
  );
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe("task fields: priority none, repeat, hours, files", () => {
  it("NONE is stored in the legacy column, keeps the level, and undo brings both back", async () => {
    const task = await seedTask(db, { priorityLevel: "HIGH", priority: null });
    const result = await runOp<{ task: { priority: string } }>(
      "task.update",
      { taskId: task.id, priority: "NONE" },
      opts()
    );
    expect(result.result.task.priority).toBe("NONE");
    expect(taskRow(db, task.id)).toMatchObject({
      priority: "none",
      priorityLevel: "HIGH",
    });

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      priority: null,
      priorityLevel: "HIGH",
    });

    // A real priority after NONE ends it.
    await runOp("task.update", { taskId: task.id, priority: "NONE" }, opts());
    await runOp("task.update", { taskId: task.id, priority: "LOW" }, opts());
    expect(taskRow(db, task.id)).toMatchObject({
      priority: null,
      priorityLevel: "LOW",
    });
  });

  it("task.create can start a task with no priority, a repeat and its hours", async () => {
    const schedule = await db.seed("workSchedule", {
      userId: OWNER_ID,
      name: "Personal",
    });
    const created = await runOp<{
      task: { id: string; priority: string; recurrenceRule: string | null };
    }>(
      "task.create",
      {
        title: "Water the plants",
        priority: "NONE",
        recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=SU",
        scheduleId: schedule.id,
      },
      opts()
    );
    expect(created.result.task).toMatchObject({
      priority: "NONE",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
    });
    expect(taskRow(db, created.result.task.id)).toMatchObject({
      isRecurring: true,
      scheduleId: schedule.id,
      priority: "none",
      priorityLevel: "MEDIUM",
    });
  });

  it("task.update sets and clears a repeat, and undo restores the rule and the flag", async () => {
    const task = await seedTask(db);
    await runOp(
      "task.update",
      { taskId: task.id, recurrenceRule: "FREQ=DAILY" },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      isRecurring: true,
      recurrenceRule: "FREQ=DAILY",
    });
    const cleared = await runOp(
      "task.update",
      { taskId: task.id, recurrenceRule: null },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      isRecurring: false,
      recurrenceRule: null,
    });
    await undoAction(cleared.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      isRecurring: true,
      recurrenceRule: "FREQ=DAILY",
    });
  });

  it("refuses a rule that is not an RRULE and hours that are not the planner's", async () => {
    const task = await seedTask(db);
    await expect(
      runOp(
        "task.update",
        { taskId: task.id, recurrenceRule: "every other tuesday" },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const theirs = await db.seed("workSchedule", {
      userId: OTHER_ID,
      name: "Work",
    });
    await expect(
      runOp("task.update", { taskId: task.id, scheduleId: theirs.id }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(taskRow(db, task.id).scheduleId ?? null).toBeNull();
  });

  it("task.attach stores a file, task.get lists it without bytes, undo removes it", async () => {
    const task = await seedTask(db);
    const attached = await runOp<{ attachment: { id: string; url: string } }>(
      "task.attach",
      {
        taskId: task.id,
        name: "../../sketch.png",
        contentBase64: PNG.toString("base64"),
      },
      opts()
    );
    expect(attached.result.attachment.url).toBe(
      `/api/tasks/${task.id}/attachments/${attached.result.attachment.id}`
    );
    expect(db.tables.taskAttachment[0]).toMatchObject({
      taskId: task.id,
      name: "sketch.png",
      mimeType: "image/png",
    });

    const got = await runOp<{ task: { attachments: { name: string }[] } }>(
      "task.get",
      { taskId: task.id },
      opts()
    );
    expect(got.result.task.attachments).toEqual([
      expect.objectContaining({ name: "sketch.png" }),
    ]);
    expect(JSON.stringify(got.result)).not.toContain("bytes");

    await undoAction(attached.actionId!, OWNER_ID);
    expect(db.tables.taskAttachment).toHaveLength(0);
  });

  it("task.attach refuses what is not an image or a PDF; task.detach cannot be undone", async () => {
    const task = await seedTask(db);
    await expect(
      runOp(
        "task.attach",
        {
          taskId: task.id,
          name: "run.sh",
          contentBase64: Buffer.from("#!/bin/sh\n").toString("base64"),
        },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const attached = await runOp<{ attachment: { id: string } }>(
      "task.attach",
      {
        taskId: task.id,
        name: "a.png",
        contentBase64: PNG.toString("base64"),
      },
      opts()
    );
    const removed = await runOp(
      "task.detach",
      { taskId: task.id, attachmentId: attached.result.attachment.id },
      opts()
    );
    expect(removed.undoable).toBe(false);
    expect(db.tables.taskAttachment).toHaveLength(0);
    expect(listOps().map((op) => op.name)).not.toContain(
      "task.attachment_remove"
    );
  });
});
