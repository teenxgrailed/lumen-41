import { NextRequest } from "next/server";

import * as tasksRoute from "@/app/api/tasks/route";
import { readFileSync } from "node:fs";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: jest.fn(), findMany: jest.fn() },
    taskReminder: { createMany: jest.fn() },
    taskListMapping: { findFirst: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));

const taskModel = prisma.task as unknown as {
  create: jest.Mock;
  findMany: jest.Mock;
};
const workspaceMemberModel = prisma.workspaceMember as unknown as {
  findUnique: jest.Mock;
};

const workspaceAccess = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: "SHARED" as const,
  role: "EDITOR" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Shared task", status: "todo", ...body }),
  });
}

describe("task workspace assignment API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace: workspaceAccess,
    });
    jest.mocked(getPlan).mockResolvedValue("PRO");
    taskModel.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "task-1",
        deadline: null,
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        ...data,
      })
    );
    taskModel.findMany.mockResolvedValue([]);
    (prisma.taskListMapping.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.taskReminder.createMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
  });

  it("defaults a shared task to its creator and records activity", async () => {
    const response = await tasksRoute.POST(
      createRequest({ busyStatus: "FREE", stageId: "stage-1" })
    );

    expect(response!.status).toBe(200);
    expect(taskModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          workspaceId: "workspace-1",
          assigneeId: "user-1",
          busyStatus: "FREE",
          stageId: "stage-1",
          activities: {
            create: {
              workspaceId: "workspace-1",
              actorId: "user-1",
              action: "CREATED",
            },
          },
        }),
      })
    );
  });

  it("preserves an explicitly unassigned shared task", async () => {
    const response = await tasksRoute.POST(createRequest({ assigneeId: null }));

    expect(response!.status).toBe(200);
    expect(taskModel.create.mock.calls[0][0].data.assigneeId).toBeNull();
    expect(workspaceMemberModel.findUnique).not.toHaveBeenCalled();
  });

  it("accepts only an assignee who belongs to the active workspace", async () => {
    workspaceMemberModel.findUnique.mockResolvedValueOnce({ id: "member-2" });
    expect(
      (await tasksRoute.POST(createRequest({ assigneeId: "user-2" })))!.status
    ).toBe(200);
    expect(taskModel.create.mock.calls[0][0].data.assigneeId).toBe("user-2");

    workspaceMemberModel.findUnique.mockResolvedValueOnce(null);
    const rejected = await tasksRoute.POST(
      createRequest({ assigneeId: "outside-user" })
    );
    expect(rejected!.status).toBe(400);
    expect(taskModel.create).toHaveBeenCalledTimes(1);
  });

  it("scopes shared task reads by workspace instead of creator", async () => {
    await tasksRoute.GET(new NextRequest("http://localhost/api/tasks"));

    expect(taskModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          isArchived: false,
        }),
      })
    );
    expect(taskModel.findMany.mock.calls[0][0].where.userId).toBeUndefined();
  });

  it("backfills legacy task owners without destructive SQL", () => {
    const migration = readFileSync(
      "prisma/migrations/20260804220000_task_workspace_assignment/migration.sql",
      "utf8"
    );

    expect(migration).toContain('SET "assigneeId" = "userId"');
    expect(migration).toContain(
      "CREATE TYPE \"TaskBusyStatus\" AS ENUM ('BUSY', 'FREE')"
    );
    expect(migration).toContain('ADD COLUMN "stageId" TEXT');
    expect(migration).toContain('CREATE TABLE "TaskActivity"');
    expect(migration).not.toMatch(/DELETE FROM|DROP TABLE|DROP COLUMN/);
  });
});
