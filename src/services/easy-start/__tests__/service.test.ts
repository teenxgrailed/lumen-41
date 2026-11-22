import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { WorkspaceRole } from "@prisma/client";

import { alwaysEasyStartEnabled } from "@/lib/feature-flags";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { undoAction } from "../../ops";
import { createFakePrisma } from "../../ops/__tests__/fake-prisma";
import {
  OWNER_ID,
  access,
  seedTask,
  taskRow,
  touchRow,
} from "../../ops/__tests__/harness";
import { generateEntryPlan } from "../generate";
import { FALLBACK_ENTRY, fallbackPlan } from "../rules";
import { balanceOverloadedDays, simplifyTask } from "../service";

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
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
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
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueEasyStartCreate: jest.fn(),
}));
jest.mock("@/lib/feature-flags", () => ({
  alwaysEasyStartEnabled: jest.fn(),
}));
jest.mock("../generate", () => ({ generateEntryPlan: jest.fn() }));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");
const enabled = jest.mocked(alwaysEasyStartEnabled);
const generate = jest.mocked(generateEntryPlan);
const publish = jest.mocked(publishRealtimeEvent);

let db = mockState.db;

// Friday 23 October 2026, 15:00 in Berlin (CEST, UTC+2).
const NOW = new Date("2026-10-23T13:00:00.000Z");
const TODAY = new Date("2026-10-22T22:00:00.000Z"); // 23.10 00:00 Berlin
const TOMORROW = "2026-10-24";

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
  enabled.mockResolvedValue(true);
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(async () =>
    access(WorkspaceRole.OWNER)
  );
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Berlin",
  });
});
afterEach(() => jest.useRealTimers());

const partsOf = (taskId: string) =>
  db.tables.taskPart.filter((part) => part.taskId === taskId);
const actions = () => db.tables.agentAction;
/** The easy-start notices; every write also publishes a plain tasks-updated. */
const easyStartCalls = () =>
  publish.mock.calls.filter(([, type]) => type === "easy-start");

describe("a new task gets an easy first step", () => {
  it("no entry: gets an entry and up to 3 subtasks, logged with an inverse, announced once", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue({
      entry: "Find last year's return",
      subtasks: ["Collect payslips", "Open the form", "Fill in income"],
      source: "ai",
    });

    const outcome = await simplifyTask({ taskId: task.id, reason: "create" });

    expect(outcome).toMatchObject({ status: "simplified", source: "ai" });
    expect(taskRow(db, task.id).entry).toBe("Find last year's return");
    expect(partsOf(task.id).map((p) => p.title)).toEqual([
      "Collect payslips",
      "Open the form",
      "Fill in income",
    ]);
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({
      op: "task.simplify",
      actor: "agent",
      status: "applied",
    });
    expect(actions()[0].inverse).toMatchObject({ op: "task.restore" });
    expect(easyStartCalls()).toHaveLength(1);
    expect(publish).toHaveBeenCalledWith(
      OWNER_ID,
      "easy-start",
      expect.objectContaining({
        actionId: actions()[0].id,
        message: expect.stringMatching(/^Simplified: /),
      })
    );

    // Undo takes the entry and the subtasks away again.
    await undoAction(actions()[0].id as string, OWNER_ID);
    expect(taskRow(db, task.id).entry).toBeNull();
    expect(partsOf(task.id)).toHaveLength(0);
  });

  it("AI allowance spent: the fixed fallback entry, no subtasks", async () => {
    const task = await seedTask(db, {});
    generate.mockResolvedValue(fallbackPlan());

    const outcome = await simplifyTask({ taskId: task.id, reason: "create" });

    expect(outcome).toMatchObject({ status: "simplified", source: "fallback" });
    expect(taskRow(db, task.id).entry).toBe(FALLBACK_ENTRY);
    expect(partsOf(task.id)).toHaveLength(0);
    expect(actions()[0].inverse).toBeTruthy();
  });

  it("a task that already has an entry is left alone", async () => {
    const task = await seedTask(db, { entry: "Open the file" });
    const outcome = await simplifyTask({ taskId: task.id, reason: "create" });
    expect(outcome).toEqual({ status: "skipped", why: "not_eligible" });
    expect(generate).not.toHaveBeenCalled();
    expect(actions()).toHaveLength(0);
  });
});

describe("a stuck task is made smaller", () => {
  const stuck = (fields: Record<string, unknown> = {}) =>
    seedTask(db, {
      title: "Do the whole tax return for the year",
      entry: "Collect every document",
      rescheduleCount: 1,
      ...fields,
    });

  it("moved once: a smaller entry and a simpler title, with before and after to undo", async () => {
    const task = await stuck();
    await db.seed("taskPart", {
      taskId: task.id,
      title: "Old step",
      position: 0,
    });
    generate.mockResolvedValue({
      title: "File taxes",
      entry: "Open the tax site",
      subtasks: ["Log in"],
      source: "ai",
    });

    const outcome = await simplifyTask({
      taskId: task.id,
      reason: "rescheduled",
    });

    expect(outcome).toMatchObject({ status: "simplified" });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        previousEntry: "Collect every document",
        previousSubtasks: ["Old step"],
      })
    );
    const row = taskRow(db, task.id);
    expect(row.title).toBe("File taxes");
    expect(row.entry).toBe("Open the tax site");
    expect(row.rescheduleCount).toBe(0);
    expect(row.simplifiedAt).toBeInstanceOf(Date);
    expect(partsOf(task.id).map((p) => p.title)).toEqual([
      "Old step",
      "Log in",
    ]);
    expect(actions()[0]).toMatchObject({ op: "task.simplify" });
    expect(actions()[0].before).toMatchObject({
      fields: {
        title: "Do the whole tax return for the year",
        entry: "Collect every document",
      },
    });

    await undoAction(actions()[0].id as string, OWNER_ID);
    const back = taskRow(db, task.id);
    expect(back.title).toBe("Do the whole tax return for the year");
    expect(back.entry).toBe("Collect every document");
    // only the subtask the rewrite added goes; the person's own stays
    expect(partsOf(task.id).map((p) => p.title)).toEqual(["Old step"]);
  });

  it("undo refuses when the person edited the task afterwards", async () => {
    const task = await stuck();
    generate.mockResolvedValue({
      title: "File taxes",
      entry: "Open the tax site",
      subtasks: [],
      source: "ai",
    });
    await simplifyTask({ taskId: task.id, reason: "rescheduled" });
    await touchRow(db, "task", task.id, { title: "My own edit" });

    const result = await undoAction(actions()[0].id as string, OWNER_ID);

    expect(result.status).toBe("undo_conflict");
    expect(taskRow(db, task.id).title).toBe("My own edit");
  });

  it("only a task that is really stuck is rewritten", async () => {
    const once = await stuck({ rescheduleCount: 0 });
    expect(
      await simplifyTask({ taskId: once.id, reason: "rescheduled" })
    ).toEqual({ status: "skipped", why: "not_eligible" });

    const cooling = await stuck({
      simplifiedAt: new Date("2026-10-20T00:00:00Z"),
    });
    expect(
      await simplifyTask({ taskId: cooling.id, reason: "rescheduled" })
    ).toEqual({ status: "skipped", why: "not_eligible" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("not started 2 days after its start day", async () => {
    const task = await seedTask(db, {
      title: "Call the bank",
      startDate: new Date("2026-10-21T00:00:00Z"),
    });
    generate.mockResolvedValue({
      title: "Bank call",
      entry: "Find the number",
      subtasks: [],
      source: "ai",
    });
    expect(
      await simplifyTask({ taskId: task.id, reason: "not_started" })
    ).toMatchObject({ status: "simplified" });
  });
});

describe("toggle and kill switch", () => {
  it("off (the person's setting or the flag): nothing is read, written or announced", async () => {
    enabled.mockResolvedValue(false);
    const fresh = await seedTask(db, { title: "New" });
    const stuck = await seedTask(db, { title: "Old", rescheduleCount: 4 });
    for (let i = 0; i < 10; i += 1) {
      await seedTask(db, { title: `t${i}`, dueDate: TODAY });
    }

    expect(await simplifyTask({ taskId: fresh.id, reason: "create" })).toEqual({
      status: "skipped",
      why: "off",
    });
    expect(
      await simplifyTask({ taskId: stuck.id, reason: "rescheduled" })
    ).toEqual({ status: "skipped", why: "off" });
    expect(await balanceOverloadedDays(OWNER_ID)).toMatchObject({
      moved: 0,
      skipped: "off",
    });

    expect(generate).not.toHaveBeenCalled();
    expect(actions()).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
    expect(taskRow(db, fresh.id).entry).toBeNull();
    expect(taskRow(db, stuck.id).title).toBe("Old");
  });
});

describe("an overloaded day", () => {
  const seedDay = async (
    count: number,
    fields: (index: number) => Record<string, unknown> = () => ({})
  ) => {
    const rows = [];
    for (let i = 1; i <= count; i += 1) {
      rows.push(
        await seedTask(db, {
          title: `Task ${i}`,
          dueDate: TODAY,
          estimatedMinutes: 30,
          isAutoScheduled: true,
          // The last two are the least important.
          priorityLevel: i > count - 2 ? "LOW" : "MEDIUM",
          ...fields(i),
        })
      );
    }
    return rows;
  };

  beforeEach(() => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
      { date: "2026-10-25", free: 900 },
    ]);
  });

  it("8 tasks on one day: 2 move to later days through the scheduler's spread, each undoable", async () => {
    const rows = await seedDay(8);

    const outcome = await balanceOverloadedDays(OWNER_ID);

    expect(outcome.moved).toBe(2);
    expect(outcome.actionIds).toHaveLength(1);
    const moved = rows.filter(
      (row) => (taskRow(db, row.id).dueDate as Date) > TODAY
    );
    expect(moved.map((row) => row.title)).toEqual(["Task 7", "Task 8"]);
    for (const row of moved) {
      expect((taskRow(db, row.id).dueDate as Date).toISOString()).toBe(
        "2026-10-23T22:00:00.000Z"
      );
    }
    // the day keeps 6
    expect(
      rows.filter(
        (row) =>
          (taskRow(db, row.id).dueDate as Date).getTime() === TODAY.getTime()
      )
    ).toHaveLength(6);
    // the spread was asked to look only after the crowded day
    expect(jest.mocked(loadSpreadDays).mock.calls[0][0].exclude).toEqual(
      new Set(moved.map((row) => row.id))
    );
    expect(actions()[0]).toMatchObject({ op: "task.spread", actor: "agent" });
    expect(publish).toHaveBeenCalledWith(
      OWNER_ID,
      "easy-start",
      expect.objectContaining({
        message: "Simplified: moved 2 tasks to later days",
        actionId: actions()[0].id,
      })
    );

    await undoAction(actions()[0].id as string, OWNER_ID);
    for (const row of rows) {
      expect((taskRow(db, row.id).dueDate as Date).getTime()).toBe(
        TODAY.getTime()
      );
    }
  });

  it("6 tasks or fewer: nothing moves", async () => {
    await seedDay(6);
    expect(await balanceOverloadedDays(OWNER_ID)).toMatchObject({ moved: 0 });
    expect(actions()).toHaveLength(0);
  });

  it("a locked task stays where it is", async () => {
    const rows = await seedDay(8, (i) =>
      i >= 7 ? { scheduleLocked: true } : {}
    );
    const outcome = await balanceOverloadedDays(OWNER_ID);
    expect(outcome.moved).toBe(2);
    // 7 and 8 are locked, so the next two least important go instead.
    const stay = rows.filter(
      (row) =>
        (taskRow(db, row.id).dueDate as Date).getTime() === TODAY.getTime()
    );
    expect(stay.map((r) => r.title)).toEqual(
      expect.arrayContaining(["Task 7", "Task 8"])
    );
  });

  it("pinned, hand-placed and hard-deadline tasks never move; only auto-scheduled ones do", async () => {
    const rows = await seedDay(9, (i) => {
      if (i === 9) return { isAutoScheduled: false };
      if (i === 8) return { hardDeadline: true };
      if (i === 7) return { isFrozen: true };
      return {};
    });
    const outcome = await balanceOverloadedDays(OWNER_ID);
    // 9 over a limit of 6 needs 3 out; 7, 8 and 9 are fixed, so 6, 5, 4 go.
    expect(outcome.moved).toBe(3);
    for (const title of ["Task 7", "Task 8", "Task 9"]) {
      const row = rows.find((r) => r.title === title)!;
      expect((taskRow(db, row.id).dueDate as Date).getTime()).toBe(
        TODAY.getTime()
      );
    }
  });

  it("after the person undid an automatic move, nothing is moved for a day", async () => {
    await seedDay(8);
    await db.seed("agentAction", {
      userId: OWNER_ID,
      workspaceId: "ws-1",
      actor: "agent",
      op: "task.spread",
      status: "undone",
      undoneAt: new Date("2026-10-23T09:00:00.000Z"),
    });
    expect(await balanceOverloadedDays(OWNER_ID)).toMatchObject({
      moved: 0,
      skipped: "paused",
    });
  });
});
