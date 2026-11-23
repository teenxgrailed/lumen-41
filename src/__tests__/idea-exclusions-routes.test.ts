import { NextRequest } from "next/server";

import { POST as controlPost } from "@/app/api/connect/control/route";
import { POST as reschedulePost } from "@/app/api/connect/reschedule/route";
import { GET as scheduleGet } from "@/app/api/connect/schedule/route";
import { POST as blockerPost } from "@/app/api/projects/[id]/blockers/route";
import { GET as roadmapGet } from "@/app/api/projects/[id]/roadmap/route";
import { GET as projectGet } from "@/app/api/projects/[id]/route";
import { GET as projectsGet } from "@/app/api/projects/route";
import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { startTaskNow } from "@/services/tasks/startTaskNow";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Idea cards: an idea is not a task of the connector's schedule, not project
 * work, and has no time to "start now". Each of these reads names kind TASK.
 */

jest.mock("@/lib/auth/api-auth");
jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
  authenticateConnectorToken: jest.fn().mockResolvedValue("u1"),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    projectStage: { count: jest.fn() },
    projectBlocker: { findMany: jest.fn() },
    calendarFeed: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    idempotencyRecord: { findUnique: jest.fn() },
    focusSession: { findFirst: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
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
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/agent-hub/items", () => ({ listItems: jest.fn() }));
jest.mock("@/services/focus/completion-ends-focus", () => ({
  endFocusForCompletedTask: jest.fn(),
}));

const workspace = {
  enabled: true,
  workspaceId: "w1",
  workspaceKind: "PERSONAL" as const,
  role: "OWNER" as const,
  dataScope: { mode: "workspace" as const, workspaceId: "w1" },
};
const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "u1", workspace });
  jest.mocked(authenticateConnectorRequest).mockResolvedValue({
    userId: "u1",
    workspace,
    bearer: {},
  } as never);
  db.task.findMany.mockResolvedValue([]);
  db.task.count.mockResolvedValue(0);
  db.project.findMany.mockResolvedValue([]);
  db.project.findFirst.mockResolvedValue({
    id: "p1",
    name: "P",
    status: "active",
  });
  db.calendarFeed.findMany.mockResolvedValue([]);
  db.calendarEvent.findMany.mockResolvedValue([]);
  db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
});

const req = (
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(`http://localhost${path}`, init);

describe("the connector's schedule never carries an idea", () => {
  it("GET /api/connect/schedule", async () => {
    await scheduleGet(req("/api/connect/schedule"));
    expect(db.task.findMany.mock.calls[0][0].where.kind).toBe("TASK");
  });

  it("POST /api/connect/reschedule", async () => {
    await reschedulePost(req("/api/connect/reschedule", { method: "POST" }));
    expect(db.task.findMany.mock.calls[0][0].where.kind).toBe("TASK");
  });

  it("POST /api/connect/control overview", async () => {
    await controlPost(
      req("/api/connect/control", {
        method: "POST",
        body: JSON.stringify({ action: "overview" }),
      })
    );
    expect(db.task.findMany.mock.calls[0][0].where.kind).toBe("TASK");
  });

  it("POST /api/connect/control update_task cannot reach an idea", async () => {
    db.task.updateMany.mockResolvedValue({ count: 0 });
    const res = await controlPost(
      req("/api/connect/control", {
        method: "POST",
        body: JSON.stringify({
          action: "update_task",
          id: "idea-1",
          status: "completed",
        }),
      })
    );
    expect(db.task.updateMany.mock.calls[0][0].where.kind).toBe("TASK");
    expect(res.status).toBe(404);
  });
});

describe("an idea is not project work", () => {
  it("GET /api/projects counts tasks only, in the project and in its stages", async () => {
    await projectsGet(req("/api/projects"));
    const include = db.project.findMany.mock.calls[0][0].include;
    expect(include.tasks.where.kind).toBe("TASK");
    expect(include.stages.include.tasks.where.kind).toBe("TASK");
  });

  it("GET /api/projects/:id lists tasks only", async () => {
    await projectGet(req("/api/projects/p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(db.project.findFirst.mock.calls[0][0].include.tasks.where.kind).toBe(
      "TASK"
    );
  });

  it("GET /api/projects/:id/roadmap reads tasks only", async () => {
    await roadmapGet(req("/api/projects/p1/roadmap?hub=0"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(db.task.findMany.mock.calls[0][0].where.kind).toBe("TASK");
  });

  it("POST /api/projects/:id/blockers refuses an idea as a blocker", async () => {
    db.task.count.mockResolvedValue(0);
    const res = await blockerPost(
      req("/api/projects/p1/blockers", {
        method: "POST",
        body: JSON.stringify({
          taskId: "idea-1",
          title: undefined,
          blockerTaskId: "t2",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(db.task.count.mock.calls[0][0].where.kind).toBe("TASK");
    expect(res?.status).toBe(400);
  });
});

describe("start now", () => {
  it("looks for a task only: an idea is not found", async () => {
    db.idempotencyRecord.findUnique.mockResolvedValue(null);
    db.task.findFirst.mockResolvedValue(null);
    db.focusSession.findFirst.mockResolvedValue(null);
    await expect(
      startTaskNow({
        userId: "u1",
        taskId: "idea-1",
        durationMinutes: 25,
        startFocus: false,
        idempotencyKey: "k1",
      })
    ).rejects.toThrow("Task not found");
    expect(db.task.findFirst.mock.calls[0][0].where.kind).toBe("TASK");
  });
});
