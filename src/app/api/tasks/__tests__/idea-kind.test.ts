import { NextRequest } from "next/server";

import { GET as connectGet } from "@/app/api/connect/tasks/route";
import { PUT } from "@/app/api/tasks/[id]/route";
import { GET } from "@/app/api/tasks/route";
import { authenticateConnectorRequest } from "@/services/connectors/auth";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Idea cards: a task list through the app or the connector returns tasks only
 * unless the caller asks for ideas, and an idea refuses a date through the
 * app's own update route.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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

const workspace = {
  enabled: true,
  workspaceId: "w1",
  workspaceKind: "SHARED" as const,
  role: "EDITOR" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "w1" },
};
const task = prisma.task as unknown as Record<string, jest.Mock>;

const whereOf = () => task.findMany.mock.calls[0][0].where;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1", workspace });
  jest.mocked(authenticateConnectorRequest).mockResolvedValue({
    userId: "user-1",
    workspace,
    bearer: {},
  } as never);
  task.findMany.mockResolvedValue([]);
});

describe("GET /api/tasks", () => {
  const get = (query = "") =>
    GET(
      new NextRequest(`http://localhost/api/tasks${query}`)
    ) as Promise<Response>;

  it("lists tasks only by default", async () => {
    await get();
    expect(whereOf().kind).toBe("TASK");
  });

  it("lists ideas, or both, when asked", async () => {
    await get("?kind=idea");
    // only the caller's own ideas: an idea is personal
    expect(whereOf()).toMatchObject({ kind: "IDEA", userId: "user-1" });
    jest.clearAllMocks();
    task.findMany.mockResolvedValue([]);
    await get("?kind=any");
    expect(whereOf()).not.toHaveProperty("kind");
    expect(whereOf().NOT).toEqual({
      kind: "IDEA",
      userId: { not: "user-1" },
    });
  });

  it("an unknown kind is the default, tasks", async () => {
    await get("?kind=everything");
    expect(whereOf().kind).toBe("TASK");
  });
});

describe("GET /api/connect/tasks", () => {
  const get = (query = "") =>
    connectGet(
      new NextRequest(`http://localhost/api/connect/tasks${query}`)
    ) as Promise<Response>;

  it("lists tasks only by default, ideas when asked", async () => {
    await get();
    expect(whereOf().kind).toBe("TASK");
    jest.clearAllMocks();
    task.findMany.mockResolvedValue([]);
    await get("?kind=idea");
    expect(whereOf()).toMatchObject({ kind: "IDEA", userId: "user-1" });
  });
});

describe("PUT /api/tasks/:id on an idea", () => {
  const idea = {
    id: "idea-1",
    kind: "IDEA",
    userId: "user-1",
    workspaceId: "w1",
    title: "Check the news",
    status: "todo",
    isArchived: false,
    isRecurring: false,
    recurrenceRule: null,
    dependsOnId: null,
    projectId: null,
    project: null,
    tags: [],
    updatedAt: new Date("2026-11-23T09:00:00Z"),
  };
  const put = (body: Record<string, unknown>) =>
    PUT(
      new NextRequest("http://localhost/api/tasks/idea-1", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "idea-1" }) }
    ) as Promise<Response>;

  beforeEach(() => {
    task.findUnique.mockResolvedValue(idea);
    task.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...idea, ...data })
    );
  });

  it.each([
    { dueDate: "2026-11-25T00:00:00.000Z" },
    { scheduledStart: "2026-11-25T10:00:00.000Z" },
    { status: "completed" },
    { isRecurring: true, recurrenceRule: "FREQ=DAILY" },
  ])("refuses %j with a 400 and writes nothing", async (body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no due date/);
    expect(task.update).not.toHaveBeenCalled();
  });

  it("lets a plain edit, and an echo with null dates, through", async () => {
    const res = await put({ title: "Check the AI news", dueDate: null });
    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalled();
  });
});
