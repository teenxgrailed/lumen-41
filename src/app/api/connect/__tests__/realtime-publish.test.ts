import { NextRequest } from "next/server";

import { POST as controlPost } from "@/app/api/connect/control/route";
import { POST as toggleToday } from "@/app/api/connect/habits/[id]/toggle-today/route";
import { POST as reschedulePost } from "@/app/api/connect/reschedule/route";
import { POST as schedulePost } from "@/app/api/connect/schedule/route";
import {
  authenticateConnectorRequest,
  authenticateConnectorToken,
} from "@/services/connectors/auth";
import { toggleHabitToday } from "@/services/habits/habit-service";

import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
  authenticateConnectorToken: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/connectors/local-events", () => ({
  createLocalEvent: jest.fn(),
}));
jest.mock("@/services/habits/habit-service", () => ({
  toggleHabitToday: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    project: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "p1" }),
    },
    calendarFeed: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const publish = publishRealtimeEventSafe as jest.Mock;
const workspace = {
  enabled: true,
  workspaceId: "w1",
  workspaceKind: "PERSONAL",
  role: "OWNER",
  dataScope: { mode: "personal" },
};

const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/connect/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateConnectorToken as jest.Mock).mockResolvedValue("u1");
  (authenticateConnectorRequest as jest.Mock).mockResolvedValue({
    userId: "u1",
    workspace,
  });
});

describe("connector write endpoints tell the open app", () => {
  it("habit toggle-today (iPhone widget) publishes tasks-updated", async () => {
    (toggleHabitToday as jest.Mock).mockResolvedValue({ completed: true });
    const res = await toggleToday(req({ completed: true }), {
      params: Promise.resolve({ id: "h1" }),
    });
    expect(res.status).toBe(200);
    expect(publish).toHaveBeenCalledWith("u1", "tasks-updated");
  });

  it("a habit that does not exist publishes nothing", async () => {
    (toggleHabitToday as jest.Mock).mockResolvedValue(null);
    const res = await toggleToday(req(), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(publish).not.toHaveBeenCalled();
  });

  it("schedule (run) and reschedule publish tasks-updated", async () => {
    await schedulePost(req());
    await reschedulePost(req());
    expect(publish.mock.calls).toEqual([
      ["u1", "tasks-updated"],
      ["u1", "tasks-updated"],
    ]);
  });

  it("control writes publish tasks and calendar, the overview does not", async () => {
    await controlPost(req({ action: "overview" }));
    expect(publish).not.toHaveBeenCalled();
    const res = await controlPost(req({ action: "create_project", name: "P" }));
    expect(res.status).toBe(201);
    expect(publish.mock.calls).toEqual([
      ["u1", "tasks-updated"],
      ["u1", "calendar-updated"],
    ]);
  });

  it("a rejected control write publishes nothing", async () => {
    publish.mockClear();
    const res = await controlPost(req({ action: "create_project" }));
    expect(res.ok).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});
