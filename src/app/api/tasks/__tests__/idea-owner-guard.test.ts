import { NextRequest } from "next/server";

import { DELETE, GET, PUT } from "@/app/api/tasks/[id]/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * An idea is personal: in a shared workspace another member's idea is not
 * found by id, through read, edit or delete. A shared task still is.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    scheduledBlock: { deleteMany: jest.fn() },
  },
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

const row = (id: string, kind: "TASK" | "IDEA", userId: string) => ({
  id,
  kind,
  userId,
  workspaceId: "w1",
  title: "Something",
  status: "todo",
  isArchived: false,
  isRecurring: false,
  recurrenceRule: null,
  dependsOnId: null,
  projectId: null,
  project: null,
  tags: [],
  updatedAt: new Date("2026-11-23T09:00:00Z"),
});
const rows = [
  row("their-idea", "IDEA", "user-2"),
  row("my-idea", "IDEA", "user-1"),
  row("their-task", "TASK", "user-2"),
];

/** The where clause as the database would apply it to the fixture rows. */
function lookup({ where }: { where: Record<string, unknown> }) {
  const found = rows.find((r) => r.id === where.id);
  if (!found) return null;
  if (where.workspaceId && where.workspaceId !== found.workspaceId) return null;
  const not = where.NOT as
    | { kind: string; userId: { not: string } }
    | undefined;
  if (not && found.kind === not.kind && found.userId !== not.userId.not)
    return null;
  return found;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (
  id: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
  query = ""
) => new NextRequest(`http://localhost/api/tasks/${id}${query}`, init);

type Handler = typeof GET;
const call = (
  handler: Handler,
  id: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
  query = ""
) => handler(req(id, init, query), params(id)) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1", workspace });
  task.findUnique.mockImplementation(async (args) => lookup(args));
  task.findFirst.mockImplementation(async (args) => lookup(args));
  task.update.mockImplementation(async ({ data }) => ({ ...rows[2], ...data }));
});

describe("another member's idea in a shared workspace", () => {
  it("is 404 on GET", async () => {
    const res = await call(GET, "their-idea");
    expect(res.status).toBe(404);
  });

  it("is 404 on PUT, and nothing is written", async () => {
    const res = await call(PUT, "their-idea", {
      method: "PUT",
      body: JSON.stringify({ title: "Mine now" }),
    });
    expect(res.status).toBe(404);
    expect(task.update).not.toHaveBeenCalled();
  });

  it("is 404 on DELETE, and nothing is archived", async () => {
    const res = await call(DELETE, "their-idea", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(task.update).not.toHaveBeenCalled();
  });

  it("is 404 on a permanent delete too", async () => {
    const res = await call(
      DELETE,
      "their-idea",
      { method: "DELETE" },
      "?permanent=true"
    );
    expect(res.status).toBe(404);
  });
});

describe("what still works in a shared workspace", () => {
  it("reads the caller's own idea", async () => {
    const res = await call(GET, "my-idea");
    expect(res.status).toBe(200);
  });

  it("reads another member's task", async () => {
    const res = await call(GET, "their-task");
    expect(res.status).toBe(200);
  });

  it("archives another member's task on DELETE", async () => {
    const res = await call(DELETE, "their-task", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(task.update).toHaveBeenCalled();
  });
});
