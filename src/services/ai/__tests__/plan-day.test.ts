import { NextRequest } from "next/server";

import { POST } from "@/app/api/ai/plan-day/route";
import { undoAction } from "@/services/ops";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import {
  OWNER_ID,
  WORKSPACE_ID,
  access,
  seedTask,
  taskRow,
} from "@/services/ops/__tests__/harness";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";

import { planMyDay, summarizePlan } from "../plan-day";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/plan-limits");
  return {
    getPlan: jest.fn(),
    canPlanMyDay: jest.fn(async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const plan = await require("@/lib/entitlements").getPlan(userId);
      return {
        allowed: actual.PLAN_LIMITS[plan].planMyDay,
        upgradeRequired: !actual.PLAN_LIMITS[plan].planMyDay,
        plan,
      };
    }),
  };
});
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(scheduleAllTasksForUser).mockReset();
  mockState.db = createFakePrisma();
  db = mockState.db;
  jest.mocked(getPlan).mockResolvedValue("PRO");
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
  jest.mocked(authenticateRequest).mockResolvedValue({
    userId: OWNER_ID,
    workspace: access(),
  } as never);
});

describe("summarizePlan", () => {
  const now = new Date("2026-10-20T08:00:00.000Z");
  const hour = 3_600_000;
  const change = (id: string, from: string | null, to: string | null) => ({
    taskId: id,
    title: `Task ${id}`,
    fromStart: from,
    fromEnd: from
      ? new Date(new Date(from).getTime() + hour).toISOString()
      : null,
    toStart: to,
    toEnd: to ? new Date(new Date(to).getTime() + hour).toISOString() : null,
  });

  it("says where each task went, in the person's day names and time zone", () => {
    const summary = summarizePlan({
      changes: [
        change("a", null, "2026-10-20T09:30:00.000Z"),
        change("b", null, "2026-10-21T07:00:00.000Z"),
        change("c", "2026-10-20T09:00:00.000Z", "2026-10-23T09:00:00.000Z"),
      ],
      unplaced: [{ taskId: "z", title: "Too big" }],
      timeZone: "Europe/Kyiv",
      now,
    });
    expect(summary.headline).toBe(
      "Placed 2 tasks, moved 1. 1 task did not fit"
    );
    expect(summary.items.map((i) => [i.title, i.day, i.time, i.moved])).toEqual(
      [
        ["Task a", "Today", "12:30–13:30", false],
        ["Task b", "Tomorrow", "10:00–11:00", false],
        ["Task c", "Fri 23 Oct", "12:00–13:00", true],
      ]
    );
  });

  it("says when there was nothing to place", () => {
    expect(
      summarizePlan({ changes: [], unplaced: [], timeZone: "UTC", now })
        .headline
    ).toMatch(/^Nothing to place/);
    expect(
      summarizePlan({
        changes: [],
        unplaced: [{ taskId: "z", title: "Z" }],
        timeZone: "UTC",
        now,
      }).headline
    ).toBe("Nothing new fit. 1 task did not fit");
  });
});

describe("planMyDay", () => {
  it("runs the scheduler as one action, lists what landed where, and one Undo puts it back", async () => {
    const placed = await seedTask(db, {
      title: "Taxes",
      isAutoScheduled: true,
      estimatedMinutes: 60,
    });
    const tooBig = await seedTask(db, {
      title: "Big one",
      isAutoScheduled: true,
      estimatedMinutes: 600,
    });
    jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
      await (
        db.client as { task: { update: (a: unknown) => Promise<unknown> } }
      ).task.update({
        where: { id: placed.id },
        data: {
          scheduledStart: new Date("2026-10-21T09:00:00.000Z"),
          scheduledEnd: new Date("2026-10-21T10:00:00.000Z"),
        },
      });
      return [];
    });

    const result = await planMyDay({
      userId: OWNER_ID,
      workspace: access(),
      actor: "user",
    });

    expect(result.placed).toBe(1);
    expect(result.items[0]).toMatchObject({
      taskId: placed.id,
      title: "Taxes",
    });
    expect(result.unplaced).toEqual([{ taskId: tooBig.id, title: "Big one" }]);
    expect(result.undoable).toBe(true);
    expect(db.tables.agentAction).toHaveLength(1);
    expect(db.tables.agentAction[0].op).toBe("schedule.auto");

    expect((await undoAction(result.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    expect(taskRow(db, placed.id as string).scheduledStart).toBeNull();
  });

  it("reports an empty plan without an undo", async () => {
    const result = await planMyDay({
      userId: OWNER_ID,
      workspace: access(),
      actor: "user",
    });
    expect(result.items).toEqual([]);
    expect(result.actionId).toBeNull();
    expect(result.undoable).toBe(false);
  });
});

describe("POST /api/ai/plan-day", () => {
  const request = () =>
    new NextRequest("http://localhost/api/ai/plan-day", { method: "POST" });

  it("refuses Free with an upgrade code and runs nothing", async () => {
    jest.mocked(getPlan).mockResolvedValue("FREE");
    const response = (await POST(request()))!;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "UPGRADE_REQUIRED" });
    expect(scheduleAllTasksForUser).not.toHaveBeenCalled();
    expect(db.tables.agentAction).toHaveLength(0);
  });

  it("plans for Pro and for a trial", async () => {
    const response = (await POST(request()))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ placed: 0, items: [] });
    expect(scheduleAllTasksForUser).toHaveBeenCalledTimes(1);
  });
});
