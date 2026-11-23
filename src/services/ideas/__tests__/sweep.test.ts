import { undoRun } from "@/services/ops";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import {
  OWNER_ID,
  access,
  seedTask,
  taskRow,
} from "@/services/ops/__tests__/harness";
import { WorkspaceRole } from "@prisma/client";

import { ideaCardsEnabled } from "@/lib/feature-flags";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { resetIdeaSweepCursor, runIdeaSweep } from "../sweep";

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
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({
  ideaCardsEnabled: jest.fn().mockResolvedValue(true),
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

// Monday 23 November 2026, 10:00 in Zurich.
const NOW = new Date("2026-11-23T09:00:00.000Z");
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const publish = jest.mocked(publishRealtimeEvent);
/** The summed Ideas lines (ops also publish tasks-updated). */
const ideaEvents = () =>
  publish.mock.calls.filter(([, type]) => type === "idea-cards");

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
  resetIdeaSweepCursor();
  jest.mocked(ideaCardsEnabled).mockResolvedValue(true);
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(async () =>
    access(WorkspaceRole.OWNER)
  );
  await db.seed("featureFlag", { key: "idea_cards", enabled: true });
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Zurich",
    easyStartExcludedProjectIds: [],
  });
});
afterEach(() => jest.useRealTimers());

const overdue = (fields: Record<string, unknown> = {}) =>
  seedTask(db, {
    title: "Read AI agents news",
    dueDate: day("2026-11-20"),
    ...fields,
  });

describe("runIdeaSweep", () => {
  it("moves overdue optional tasks to Ideas and leaves everything else a task, stamped", async () => {
    const converts = await overdue();
    const moved = await overdue({
      title: "Watch the breakdown",
      dueDate: day("2026-11-22"),
      rescheduleCount: 1,
    });
    const fresh = await seedTask(db, { title: "Read news", dueDate: null });
    const oneDay = await overdue({ dueDate: day("2026-11-22") });
    const commitment = await overdue({ title: "Read contract before Friday" });
    const high = await overdue({ priorityLevel: "HIGH" });
    const future = await overdue({
      title: "Watch the breakdown",
      dueDate: day("2026-12-01"),
    });
    const plain = await overdue({ title: "Write the report" });

    const result = await runIdeaSweep(NOW);

    expect(result).toMatchObject({ skipped: null, converted: 2, people: 1 });
    for (const id of [converts.id, moved.id]) {
      expect(taskRow(db, id)).toMatchObject({
        kind: "IDEA",
        ideaSource: "converted",
        dueDate: null,
      });
    }
    for (const left of [fresh, oneDay, commitment, plain]) {
      const row = taskRow(db, left.id);
      expect(row.kind).toBe("TASK");
      // examined and left: stamped, so it is not read again
      expect(row.ideaCheckedAt).not.toBeNull();
    }
    // high priority and a future due date are kept out by the read itself: not
    // read, so not stamped (the future one is looked at when its day comes)
    for (const kept of [high, future]) {
      expect(taskRow(db, kept.id)).toMatchObject({
        kind: "TASK",
        ideaCheckedAt: null,
      });
    }
    // the old due date stays in the action's snapshot
    const action = db.tables.agentAction.find((a) => a.op === "idea.convert");
    expect(JSON.stringify(action?.before)).toContain("2026-11-20");
  });

  it("sends one summed line for the run, with the run to undo", async () => {
    await overdue({ title: "Read AI agents news" });
    await overdue({ title: "Watch the breakdown" });
    await overdue({ title: "Try out Cursor tutorial" });

    await runIdeaSweep(NOW);

    expect(ideaEvents()).toHaveLength(1);
    const [userId, type, details] = ideaEvents()[0];
    expect(userId).toBe(OWNER_ID);
    expect(type).toBe("idea-cards");
    expect(details?.message).toMatch(/^Moved 3 to Ideas: /);
    expect(details?.runId).toBeTruthy();
    expect(db.tables.agentRun).toHaveLength(1);
    expect(db.tables.agentRun[0].status).toBe("finished");
  });

  it("one Undo of the run restores every task, and the job never converts them again", async () => {
    const a = await overdue({ title: "Read AI agents news" });
    const b = await overdue({ title: "Watch the breakdown" });
    await runIdeaSweep(NOW);
    const runId = ideaEvents()[0][2]?.runId as string;

    const undone = await undoRun(runId, OWNER_ID, "user");
    expect(undone.status).toBe("undone");
    for (const task of [a, b]) {
      const row = taskRow(db, task.id);
      expect(row.kind).toBe("TASK");
      expect(row.dueDate).toEqual(day("2026-11-20"));
    }

    publish.mockClear();
    const again = await runIdeaSweep(NOW);
    expect(again.converted).toBe(0);
    expect(ideaEvents()).toHaveLength(0);
    expect(taskRow(db, a.id).kind).toBe("TASK");
  });

  it("a changed title is looked at again", async () => {
    const task = await seedTask(db, {
      title: "Write the report",
      dueDate: day("2026-11-20"),
    });
    await runIdeaSweep(NOW);
    expect(taskRow(db, task.id).ideaCheckedAt).toBeInstanceOf(Date);
    // the op clears the stamp when the title changes
    const { runOp } = await import("@/services/ops");
    await runOp(
      "task.update",
      { taskId: task.id, title: "Read the news" },
      {
        userId: OWNER_ID,
        workspace: access(WorkspaceRole.OWNER),
        actor: "user",
      }
    );
    expect(taskRow(db, task.id).ideaCheckedAt).toBeNull();
    await runIdeaSweep(NOW);
    expect(taskRow(db, task.id).kind).toBe("IDEA");
  });

  it("converts at most 5 per person per run; the rest wait, unstamped, for the next", async () => {
    for (let i = 0; i < 7; i += 1) await overdue({ title: `Read news ${i}` });

    const first = await runIdeaSweep(NOW);
    expect(first.converted).toBe(5);
    const waiting = db.tables.task.filter((t) => t.kind === "TASK");
    expect(waiting).toHaveLength(2);
    for (const row of waiting) expect(row.ideaCheckedAt).toBeNull();
    expect(ideaEvents()[0][2]?.message).toMatch(/^Moved 5 to Ideas/);

    publish.mockClear();
    const second = await runIdeaSweep(NOW);
    expect(second.converted).toBe(2);
  });

  it("converts at most 20 a day", async () => {
    // 18 already moved in the last 24 hours
    for (let i = 0; i < 18; i += 1) {
      await seedTask(db, {
        title: `Moved ${i}`,
        kind: "IDEA",
        ideaSource: "converted",
        ideaCheckedAt: new Date(NOW.getTime() - 3_600_000),
      });
    }
    for (let i = 0; i < 5; i += 1) await overdue({ title: `Read news ${i}` });
    const result = await runIdeaSweep(NOW);
    expect(result.converted).toBe(2);
    // one older than a day does not count
    const old = await seedTask(db, {
      kind: "IDEA",
      ideaSource: "converted",
      ideaCheckedAt: new Date(NOW.getTime() - 2 * 86_400_000),
    });
    expect(old.id).toBeTruthy();
  });

  it("does nothing while the kill switch is off", async () => {
    db.tables.featureFlag[0].enabled = false;
    const task = await overdue();
    const result = await runIdeaSweep(NOW);
    expect(result).toEqual({
      skipped: "flag_off",
      converted: 0,
      people: 0,
      stamped: 0,
    });
    expect(taskRow(db, task.id)).toMatchObject({
      kind: "TASK",
      ideaCheckedAt: null,
    });
  });

  it("leaves a person who turned idea cards off alone, unstamped", async () => {
    jest.mocked(ideaCardsEnabled).mockResolvedValue(false);
    const task = await overdue();
    const result = await runIdeaSweep(NOW);
    expect(result.converted).toBe(0);
    expect(taskRow(db, task.id)).toMatchObject({
      kind: "TASK",
      ideaCheckedAt: null,
    });
  });

  it("keeps out a project the person excluded from easy start", async () => {
    db.tables.userSettings.find(
      (row) => row.userId === OWNER_ID
    )!.easyStartExcludedProjectIds = ["p-client"];
    const task = await overdue({ projectId: "p-client" });
    const result = await runIdeaSweep(NOW);
    expect(result.converted).toBe(0);
    expect(taskRow(db, task.id).kind).toBe("TASK");
  });

  it("does not touch a task in an open day plan", async () => {
    const task = await overdue();
    const plan = await db.seed("dayPlan", {
      userId: OWNER_ID,
      status: "active",
    });
    await db.seed("dayPlanItem", { planId: plan.id, taskId: task.id });
    const result = await runIdeaSweep(NOW);
    expect(result.converted).toBe(0);
    expect(taskRow(db, task.id).kind).toBe("TASK");
  });

  it("does not touch Someday, repeating, synced, started or other people's tasks", async () => {
    const skipped = [
      await overdue({ somedayAt: NOW }),
      await overdue({ isRecurring: true, recurrenceRule: "FREQ=DAILY" }),
      await overdue({ externalTaskId: "g1" }),
      await overdue({ hardDeadline: true }),
      await overdue({ assigneeId: "someone-else" }),
    ];
    const result = await runIdeaSweep(NOW);
    expect(result.converted).toBe(0);
    for (const task of skipped) expect(taskRow(db, task.id).kind).toBe("TASK");
  });

  it("pages through every task, stamping what it leaves, and starts over at the end", async () => {
    for (let i = 0; i < 205; i += 1) {
      await seedTask(db, {
        title: `Write part ${i}`,
        dueDate: day("2026-11-20"),
      });
    }
    const first = await runIdeaSweep(NOW);
    expect(first.stamped).toBe(205);
    expect(db.tables.task.every((t) => t.ideaCheckedAt instanceof Date)).toBe(
      true
    );
    // nothing left to read; a later run is cheap and changes nothing
    const second = await runIdeaSweep(NOW);
    expect(second).toMatchObject({ converted: 0, stamped: 0 });
  });

  it("gives each person their own line", async () => {
    await overdue({ title: "Read news" });
    await seedTask(db, {
      title: "Watch a talk",
      dueDate: day("2026-11-20"),
      userId: "user-2",
      assigneeId: "user-2",
    });
    await db.seed("userSettings", {
      userId: "user-2",
      timeZone: "Europe/Zurich",
      easyStartExcludedProjectIds: [],
    });
    workspaceAuth.resolveWorkspaceAccess.mockImplementation(
      async ({ userId }: { userId: string }) => ({
        ...access(WorkspaceRole.OWNER),
        workspaceId: `ws-${userId}`,
      })
    );
    const result = await runIdeaSweep(NOW);
    expect(result).toMatchObject({ converted: 2, people: 2 });
    expect(
      ideaEvents()
        .map((c) => c[0])
        .sort()
    ).toEqual([OWNER_ID, "user-2"].sort());
  });
});
