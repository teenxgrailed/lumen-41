import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  }),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({}),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const taskCreate = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/import/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/import/tasks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    taskCreate.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          task: { create: taskCreate },
          tag: { findFirst: jest.fn(), create: jest.fn() },
          project: { findFirst: jest.fn(), create: jest.fn() },
        })
    );
  });

  it("falls back to now for an unparseable createdAt instead of Invalid Date", async () => {
    const res = await POST(
      req({
        tasks: [{ title: "A", status: "todo", createdAt: "not-a-date" }],
      })
    );
    const json = await (res as Response).json();
    expect(json.imported).toBe(1);
    const created = taskCreate.mock.calls[0][0].data.createdAt as Date;
    expect(Number.isNaN(created.getTime())).toBe(false);
  });

  it("raises the transaction timeout above the 5s default", async () => {
    await POST(req({ tasks: [{ title: "A", status: "todo" }] }));
    expect((prisma.$transaction as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(
      (prisma.$transaction as jest.Mock).mock.calls[0][1].timeout
    ).toBeGreaterThan(5000);
  });

  it("reports skipped tasks instead of dropping them silently", async () => {
    taskCreate.mockRejectedValueOnce(new Error("bad row"));
    const res = await POST(
      req({
        tasks: [
          { title: "Bad", status: "todo" },
          { title: "Good", status: "todo" },
        ],
      })
    );
    const json = await (res as Response).json();
    expect(json.imported).toBe(1);
    expect(json.skipped).toBe(1);
    expect(json.skippedTasks[0].title).toBe("Bad");
  });

  it("restores archive state and schedule inputs from its own export", async () => {
    await POST(
      req({
        tasks: [
          {
            title: "Old",
            status: "todo",
            isArchived: true,
            archivedAt: "2026-01-02T00:00:00.000Z",
            startDate: "2026-02-01T00:00:00.000Z",
            deadline: "2026-03-01T00:00:00.000Z",
            hardDeadline: true,
            estimatedMinutes: 45,
            priorityLevel: "HIGH",
            energyRequired: "LOW",
            contextTag: "phone",
          },
        ],
      })
    );
    const data = taskCreate.mock.calls[0][0].data;
    expect(data.isArchived).toBe(true);
    expect(data.archivedAt).toEqual(new Date("2026-01-02T00:00:00.000Z"));
    expect(data.startDate).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(data.hardDeadline).toBe(true);
    expect(data.estimatedMinutes).toBe(45);
    expect(data.priorityLevel).toBe("HIGH");
    expect(data.energyRequired).toBe("LOW");
    expect(data.contextTag).toBe("phone");
  });
});
