import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { newDateFromYMD } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { prismaDataSource } from "../prisma-source";
import type { NeedtTaskRow } from "../task-view";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    workspaceMember: { findMany: jest.fn() },
    taskWait: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    habit: { findMany: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    closedDay: { findMany: jest.fn() },
    calendarFeed: { findMany: jest.fn() },
  },
}));

const workspace: WorkspaceAccess = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.VIEWER,
  dataScope: { mode: "workspace", workspaceId: "workspace-1" },
};

const NOW = newDateFromYMD(2026, 8, 16);

function taskRow(id: string, dependsOnId: string | null = null): NeedtTaskRow {
  return {
    id,
    title: id,
    status: "todo",
    project: null,
    scheduledStart: null,
    dueDate: null,
    estimatedMinutes: null,
    noSlot: false,
    activities: [],
    lastTouchedAt: null,
    updatedAt: newDateFromYMD(2026, 8, 20),
    assigneeId: null,
    globalStage: null,
    dependsOnId,
    parts: [],
    entry: null,
    valueCents: null,
    earnedCents: null,
    waits: [],
    previousScheduledStart: null,
  } as unknown as NeedtTaskRow;
}

describe("prismaDataSource workspace scope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.userSettings.findUnique).mockResolvedValue({
      timeZone: "UTC",
    } as never);
  });

  it("queries tasks through verified workspace scope and preserves cuid ids", async () => {
    jest
      .mocked(prisma.task.findMany)
      .mockResolvedValue([
        taskRow("task-a", "outside-task"),
        taskRow("task-b", "task-a"),
      ]);

    const tasks = await prismaDataSource(
      "user-1",
      workspace,
      () => NOW
    ).getTasks();

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1", isArchived: false },
      })
    );
    expect(tasks.map(({ id, blockedBy }) => ({ id, blockedBy }))).toEqual([
      { id: "task-a", blockedBy: undefined },
      { id: "task-b", blockedBy: "task-a" },
    ]);
  });

  it("uses workspace members as the people registry", async () => {
    jest.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
      {
        user: {
          id: "user-1",
          name: "Maxim",
          email: "maxim@example.test",
          initials: "MX",
          hue: "#123456",
        },
      },
    ] as never);

    const people = await prismaDataSource(
      "user-1",
      workspace,
      () => NOW
    ).getPeople();

    expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1" },
      })
    );
    expect(people).toEqual([
      {
        id: "user-1",
        name: "Maxim",
        initials: "MX",
        hue: "#123456",
      },
    ]);
  });

  it("keeps habits inside both the workspace and current-user boundary", async () => {
    jest.mocked(prisma.habit.findMany).mockResolvedValue([]);

    await prismaDataSource("user-1", workspace, () => NOW).getHabits();

    expect(prisma.habit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          userId: "user-1",
          archivedAt: null,
          isActive: true,
          kind: "BUILD",
        },
      })
    );
  });
});
