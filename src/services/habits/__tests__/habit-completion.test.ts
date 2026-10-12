import { setHabitCompletionToday } from "@/services/habits/habit-service";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

describe("setHabitCompletionToday", () => {
  const transaction = {
    habit: { findFirst: jest.fn() },
    habitCompletion: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.userSettings.findUnique).mockResolvedValue({
      timeZone: "Europe/Zurich",
    } as never);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback) => callback(transaction as never));
    transaction.habit.findFirst.mockResolvedValue({ id: "habit-1" });
    transaction.habitCompletion.findUnique.mockResolvedValue(null);
    transaction.habitCompletion.upsert.mockResolvedValue({});
    transaction.habitCompletion.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("scopes the habit before atomically upserting the user-zone day", async () => {
    const result = await setHabitCompletionToday({
      userId: "user-1",
      workspace,
      habitId: "habit-1",
      completed: true,
      now: newDate("2026-09-19T22:30:00.000Z"),
    });

    expect(transaction.habit.findFirst).toHaveBeenCalledWith({
      where: {
        id: "habit-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        archivedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    const date = newDate("2026-09-20T00:00:00.000Z");
    expect(transaction.habitCompletion.upsert).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: "habit-1", date } },
      update: {},
      create: { habitId: "habit-1", date },
    });
    expect(result).toEqual({
      habitId: "habit-1",
      date: "2026-09-20",
      completed: true,
    });
  });

  it("uses deleteMany so repeated undo remains idempotent", async () => {
    await setHabitCompletionToday({
      userId: "user-1",
      workspace,
      habitId: "habit-1",
      completed: false,
      now: newDate("2026-09-19T12:00:00.000Z"),
    });
    expect(transaction.habitCompletion.deleteMany).toHaveBeenCalledWith({
      where: {
        habitId: "habit-1",
        date: newDate("2026-09-19T00:00:00.000Z"),
      },
    });
  });

  it("does not write when the scoped habit is unavailable", async () => {
    transaction.habit.findFirst.mockResolvedValue(null);
    const result = await setHabitCompletionToday({
      userId: "user-1",
      workspace,
      habitId: "foreign-habit",
      completed: true,
    });
    expect(result).toBeNull();
    expect(transaction.habitCompletion.upsert).not.toHaveBeenCalled();
    expect(transaction.habitCompletion.deleteMany).not.toHaveBeenCalled();
  });
});
