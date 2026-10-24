import { NextRequest } from "next/server";

import { PUT } from "@/app/api/tasks/[id]/route";
import { POST } from "@/app/api/tasks/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * The task routes used to spread the request body into Prisma behind a list of
 * keys to delete. A nested relation write (`reminders: { create: [...] }`)
 * was not on that list, so a caller could have Needt notify someone else.
 * Only the columns of services/tasks/task-input.ts get through now.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    taskReminder: { createMany: jest.fn() },
    tag: { count: jest.fn() },
    taskListMapping: { findFirst: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    project: { findFirst: jest.fn() },
    scheduledBlock: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn(async () => "PRO"),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isTaskPlacementBlocked: jest.fn(async () => false),
}));
jest.mock("@/lib/task-block-push", () => ({
  deleteTaskBlockEvent: jest.fn(),
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));
jest.mock("@/services/tasks/dependencies", () => ({
  findTaskProjectMoveConflict: jest.fn(),
}));

const VICTIM = "victim-user";
const workspace = {
  enabled: true,
  workspaceId: "w1",
  workspaceKind: "SHARED" as const,
  role: "EDITOR" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "w1" },
};

const taskModel = prisma.task as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
};
const reminderModel = prisma.taskReminder as unknown as {
  createMany: jest.Mock;
};

/** Every relation of Task a client could try to write through nested input. */
const NESTED_WRITES: Record<string, unknown> = {
  reminders: { create: [{ userId: VICTIM, channels: ["email"] }] },
  scheduledBlocks: { create: [{ userId: VICTIM, start: "x", end: "y" }] },
  tags: { connect: [{ id: "someone-elses-label" }] },
  dependsOn: { connect: { id: "someone-elses-task" } },
  habit: { connect: { id: "someone-elses-habit" } },
  user: { connect: { id: VICTIM } },
  workspace: { connect: { id: "another-workspace" } },
  timeEntries: { create: [{ userId: VICTIM }] },
  proactiveNudges: { create: [{ userId: VICTIM }] },
  blockedByDependencies: { create: [{ blockerId: "t" }] },
  focusSessions: { create: [{ userId: VICTIM }] },
};

async function post(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Plan", status: "todo", ...body }),
    })
  );
  return response as Response;
}

async function put(body: Record<string, unknown>) {
  const response = await PUT(
    new NextRequest("http://localhost/api/tasks/task-1", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "task-1" }) }
  );
  return response as Response;
}

const stored = {
  id: "task-1",
  userId: "user-1",
  workspaceId: "w1",
  title: "Plan",
  status: "todo",
  isArchived: false,
  isRecurring: false,
  recurrenceRule: null,
  dependsOnId: null,
  projectId: null,
  project: null,
  tags: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1", workspace });
  taskModel.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "task-1", ...data })
  );
  taskModel.findUnique.mockResolvedValue(stored);
  taskModel.update.mockImplementation(({ data }) =>
    Promise.resolve({ ...stored, ...data })
  );
  taskModel.findFirst.mockResolvedValue(null);
  (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue(null);
  reminderModel.createMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/tasks", () => {
  it.each(Object.entries(NESTED_WRITES))(
    "refuses a nested write on %s before anything is stored",
    async (key, value) => {
      const response = await post({ [key]: value });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(key);
      expect(taskModel.create).not.toHaveBeenCalled();
      expect(reminderModel.createMany).not.toHaveBeenCalled();
    }
  );

  it("never lets a client name the owner, the workspace or server-owned columns", async () => {
    const response = await post({
      userId: VICTIM,
      workspaceId: "another-workspace",
      habitId: "someone-elses-habit",
      boardId: "someone-elses-board",
      blockFeedId: "someone-elses-feed",
      externalTaskId: "x",
      isSample: true,
      createdAt: "2001-01-01T00:00:00.000Z",
      estimatedMinutes: 30,
    });
    expect(response.status).toBe(200);
    const data = taskModel.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "user-1",
      workspaceId: "w1",
      title: "Plan",
      estimatedMinutes: 30,
    });
    for (const key of [
      "habitId",
      "boardId",
      "blockFeedId",
      "externalTaskId",
      "isSample",
      "createdAt",
    ]) {
      expect(data).not.toHaveProperty(key);
    }
    // The only nested writes are the ones the route builds itself.
    expect(Object.keys(data.activities)).toEqual(["create"]);
    expect(data.activities.create).toMatchObject({
      workspaceId: "w1",
      actorId: "user-1",
    });
  });

  it("checks the type of a column instead of leaving it to Prisma", async () => {
    for (const bad of [
      { estimatedMinutes: "lots" },
      { dueDate: "not a date" },
      { energyRequired: "EXTREME" },
      { busyStatus: "AWAY" },
      { hardDeadline: "yes" },
      { tagIds: "label-1" },
    ]) {
      const response = await post(bad);
      expect([bad, response.status]).toEqual([bad, 400]);
    }
    expect(taskModel.create).not.toHaveBeenCalled();
  });

  it("keeps what the clients send: columns, labels, a chosen id, dates", async () => {
    (prisma.tag.count as jest.Mock).mockResolvedValue(1);
    const response = await post({
      id: "from-a-page-item",
      description: "<p>x</p>",
      dueDate: "2026-10-30T12:00:00.000Z",
      priorityLevel: "HIGH",
      energyRequired: "LOW",
      isAutoScheduled: true,
      trashedAt: null,
      tagIds: ["label-1"],
      recurrenceRule: "FREQ=WEEKLY",
    });
    expect(response.status).toBe(200);
    const data = taskModel.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: "from-a-page-item",
      priorityLevel: "HIGH",
      energyRequired: "LOW",
      isAutoScheduled: true,
      trashedAt: null,
      isRecurring: true,
      tags: { connect: [{ id: "label-1" }] },
    });
    expect(data.dueDate).toEqual(new Date("2026-10-30T12:00:00.000Z"));
  });

  it("only links a task that waits on a task of the workspace", async () => {
    const refused = await post({ dependsOnId: "someone-elses-task" });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toBe("Invalid dependency");
    expect(taskModel.findFirst).toHaveBeenCalledWith({
      where: { id: "someone-elses-task", workspaceId: "w1" },
      select: { id: true },
    });
    expect(taskModel.create).not.toHaveBeenCalled();

    taskModel.findFirst.mockResolvedValue({ id: "blocker" });
    const linked = await post({ dependsOnId: "blocker" });
    expect(linked.status).toBe(200);
    expect(taskModel.create.mock.calls[0][0].data.dependsOnId).toBe("blocker");
  });
});

describe("PUT /api/tasks/[id]", () => {
  it.each(Object.entries(NESTED_WRITES))(
    "refuses a nested write on %s before anything is stored",
    async (key, value) => {
      const response = await put({ title: "Changed", [key]: value });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(key);
      expect(taskModel.update).not.toHaveBeenCalled();
    }
  );

  it("never lets a client move the task to another owner or workspace", async () => {
    const response = await put({
      userId: VICTIM,
      workspaceId: "another-workspace",
      habitId: "someone-elses-habit",
      blockEventId: "x",
      isSample: true,
      title: "Changed",
    });
    expect(response.status).toBe(200);
    const { data, where } = taskModel.update.mock.calls[0][0];
    expect(where).toEqual({ id: "task-1", workspaceId: "w1" });
    expect(data.title).toBe("Changed");
    for (const key of [
      "userId",
      "workspaceId",
      "habitId",
      "blockEventId",
      "isSample",
    ]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it("drops what a client echoes back from a read instead of failing", async () => {
    const response = await put({
      title: "Echoed",
      project: { id: "p1", name: "P" },
      parts: [{ id: "a" }],
      waits: [],
      attachments: [],
      activities: [{ id: "x" }],
      archivedAt: "2020-01-01T00:00:00.000Z",
      recurrenceMasterId: "m1",
    });
    expect(response.status).toBe(200);
    const data = taskModel.update.mock.calls[0][0].data;
    // The route itself writes `project` (undefined unless projectId is sent).
    expect(data.project).toBeUndefined();
    for (const key of ["parts", "waits", "attachments", "archivedAt"]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data).not.toHaveProperty("recurrenceMasterId");
    // Only the activity the route writes itself.
    expect(data.activities).toEqual({
      create: { workspaceId: "w1", actorId: "user-1", action: "UPDATED" },
    });
  });

  it("only moves a dependency to a task of the workspace", async () => {
    const refused = await put({ dependsOnId: "someone-elses-task" });
    expect(refused.status).toBe(400);
    expect(taskModel.update).not.toHaveBeenCalled();

    const itself = await put({ dependsOnId: "task-1" });
    expect(itself.status).toBe(400);

    taskModel.findFirst.mockResolvedValue({ id: "blocker" });
    const moved = await put({ dependsOnId: "blocker" });
    expect(moved.status).toBe(200);
  });

  it("does not look again at a dependency the task already has", async () => {
    taskModel.findUnique.mockResolvedValue({ ...stored, dependsOnId: "old" });
    const response = await put({ dependsOnId: "old", title: "Same link" });
    expect(response.status).toBe(200);
    expect(taskModel.findFirst).not.toHaveBeenCalled();
  });
});
