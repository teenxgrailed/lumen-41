import { NextRequest } from "next/server";

import { POST } from "../route";

const create = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: (args: unknown) => create(args) },
    taskReminder: { createMany: jest.fn() },
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(async () => ({
    userId: "u1",
    workspace: { workspaceId: "w1" },
  })),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn(async () => "PRO"),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isTaskPlacementBlocked: jest.fn(async () => false),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/tasks status", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockImplementation(async ({ data }) => ({
      id: "t1",
      deadline: null,
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      ...data,
    }));
  });

  // Task.status has no database default and the v3 composer sends none, so
  // the create used to fail with a 500 ("Argument `status` is missing").
  it("opens the task as todo when the body names no status", async () => {
    const res = await post({ title: "Buy milk", estimatedMinutes: 30 });
    expect(res?.status).toBe(200);
    expect(create.mock.calls[0][0].data.status).toBe("todo");
  });

  it("keeps a status the caller names", async () => {
    const res = await post({ title: "Done already", status: "completed" });
    expect(res?.status).toBe(200);
    expect(create.mock.calls[0][0].data.status).toBe("completed");
  });
});
