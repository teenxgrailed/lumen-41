import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { WorkspaceRole } from "@prisma/client";

import { runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, access, opts, seedTask, taskRow } from "./harness";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
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
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/scheduling/spread-capacity", () => ({
  loadSpreadDays: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;
const iso = (v: unknown) => (v ? (v as Date).toISOString() : null);

// Friday 23 October 2026, 15:00 in Berlin (CEST, UTC+2).
const NOW = new Date("2026-10-23T13:00:00.000Z");
const MIDNIGHT = {
  "2026-10-20": "2026-10-19T22:00:00.000Z",
  "2026-10-23": "2026-10-22T22:00:00.000Z",
  // after the switch to CET (UTC+1)
  "2026-10-26": "2026-10-25T23:00:00.000Z",
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "queueMicrotask",
    ],
  });
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(async () =>
    access(WorkspaceRole.OWNER)
  );
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Berlin",
  });
  jest.mocked(loadSpreadDays).mockResolvedValue([
    { date: "2026-10-23", free: 30 },
    { date: "2026-10-24", free: 0 },
    { date: "2026-10-25", free: 0 },
    { date: "2026-10-26", free: 60 },
  ]);
});
afterEach(() => jest.useRealTimers());

describe("task.spread", () => {
  it("scope today: untimed tasks go to the first day with room, one that fits today stays, and one undo puts them back", async () => {
    const dueToday = new Date(MIDNIGHT["2026-10-23"]);
    const long = await seedTask(db, {
      title: "Long",
      dueDate: dueToday,
      deadline: dueToday,
      estimatedMinutes: 60,
    });
    const urgent = await seedTask(db, {
      title: "Urgent",
      dueDate: dueToday,
      estimatedMinutes: 30,
      priorityLevel: "HIGH",
    });
    const timed = await seedTask(db, {
      title: "Timed today",
      dueDate: dueToday,
      estimatedMinutes: 30,
      scheduledStart: new Date("2026-10-23T08:00:00.000Z"),
      scheduledEnd: new Date("2026-10-23T08:30:00.000Z"),
    });
    const fixed = await seedTask(db, {
      title: "Fixed",
      dueDate: dueToday,
      scheduleLocked: true,
    });

    const run = await runOp<{
      today: string;
      moved: Array<{ taskId: string; date: string }>;
      stayed: Array<{ taskId: string; date: string }>;
      unplaced: Array<{ taskId: string }>;
    }>("task.spread", { scope: "today" }, opts());

    expect(run.result.today).toBe("2026-10-23");
    // Urgent goes first and takes today's half hour; Long goes to Monday.
    expect(run.result.stayed).toEqual([
      expect.objectContaining({ taskId: urgent.id, date: "2026-10-23" }),
    ]);
    expect(run.result.moved).toEqual([
      expect.objectContaining({ taskId: long.id, date: "2026-10-26" }),
    ]);
    expect(run.result.unplaced).toEqual([]);
    expect(iso(taskRow(db, long.id).dueDate)).toBe(MIDNIGHT["2026-10-26"]);
    // a deadline equal to the due date moves with it
    expect(iso(taskRow(db, long.id).deadline)).toBe(MIDNIGHT["2026-10-26"]);
    expect(iso(taskRow(db, urgent.id).dueDate)).toBe(dueToday.toISOString());
    expect(iso(taskRow(db, timed.id).dueDate)).toBe(dueToday.toISOString());
    expect(iso(taskRow(db, fixed.id).dueDate)).toBe(dueToday.toISOString());
    // the ones being spread do not count against the days they are spread over
    expect(jest.mocked(loadSpreadDays).mock.calls[0][0]).toMatchObject({
      today: "2026-10-23",
      days: 7,
      timeZone: "Europe/Berlin",
      exclude: new Set([long.id, urgent.id]),
    });
    expect(run.undoable).toBe(true);

    await undoAction(run.actionId!, OWNER_ID);
    expect(iso(taskRow(db, long.id).dueDate)).toBe(dueToday.toISOString());
    expect(iso(taskRow(db, long.id).deadline)).toBe(dueToday.toISOString());
  });

  it("taskIds: an overdue placed task goes to today with its time of day and its blocks; undo restores them", async () => {
    const start = new Date("2026-10-20T07:00:00.000Z");
    const end = new Date("2026-10-20T07:30:00.000Z");
    const late = await seedTask(db, {
      title: "Late",
      dueDate: new Date(MIDNIGHT["2026-10-20"]),
      scheduledStart: start,
      scheduledEnd: end,
    });
    await db.seed("scheduledBlock", {
      taskId: late.id,
      userId: OWNER_ID,
      start,
      end,
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: false,
    });

    const run = await runOp<{ moved: Array<{ date: string }> }>(
      "task.spread",
      { taskIds: [late.id] },
      opts()
    );

    expect(run.result.moved).toEqual([
      expect.objectContaining({ date: "2026-10-23" }),
    ]);
    expect(iso(taskRow(db, late.id).dueDate)).toBe(MIDNIGHT["2026-10-23"]);
    // 09:00 Berlin on both days
    expect(iso(taskRow(db, late.id).scheduledStart)).toBe(
      "2026-10-23T07:00:00.000Z"
    );
    expect(iso(db.tables.scheduledBlock[0].start)).toBe(
      "2026-10-23T07:00:00.000Z"
    );

    await undoAction(run.actionId!, OWNER_ID);
    expect(iso(taskRow(db, late.id).dueDate)).toBe(MIDNIGHT["2026-10-20"]);
    expect(iso(taskRow(db, late.id).scheduledStart)).toBe(start.toISOString());
    expect(iso(db.tables.scheduledBlock[0].start)).toBe(start.toISOString());
  });

  it("nothing with room: every task stays and there is nothing to undo", async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: -600 },
      { date: "2026-10-24", free: 0 },
    ]);
    const late = await seedTask(db, {
      title: "Late",
      dueDate: new Date(MIDNIGHT["2026-10-20"]),
    });
    const run = await runOp<{ moved: unknown[]; unplaced: unknown[] }>(
      "task.spread",
      { scope: "overdue" },
      opts()
    );
    expect(run.result.moved).toEqual([]);
    expect(run.result.unplaced).toEqual([
      expect.objectContaining({ taskId: late.id }),
    ]);
    expect(run.undoable).toBe(false);
    expect(iso(taskRow(db, late.id).dueDate)).toBe(MIDNIGHT["2026-10-20"]);
  });

  it("asks for either taskIds or a scope", async () => {
    await expect(runOp("task.spread", {}, opts())).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      runOp("task.spread", { scope: "today", taskIds: ["x"] }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
