import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { WorkspaceRole } from "@prisma/client";

import { easyStartSettings } from "@/lib/feature-flags";
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
import {
  applyProposal,
  balanceOverloadedDays,
  dismissProposal,
  simplifyTask,
  stampLookedAt,
} from "../service";

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
  easyStartSettings: jest.fn(),
}));
jest.mock("../generate", () => ({ generateEntryPlan: jest.fn() }));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");
const settingsMock = jest.mocked(easyStartSettings);
const generate = jest.mocked(generateEntryPlan);
const publish = jest.mocked(publishRealtimeEvent);
const AUTO = { mode: "auto" as const, excludedProjectIds: [] as string[] };

let db = mockState.db;

// Friday 23 October 2026, 15:00 in Berlin (CEST, UTC+2).
const NOW = new Date("2026-10-23T13:00:00.000Z");
const TODAY = new Date("2026-10-22T22:00:00.000Z"); // 23.10 00:00 Berlin
const TOMORROW = "2026-10-24";

beforeEach(async () => {
  jest.resetAllMocks();
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
  publish.mockResolvedValue(undefined);
  settingsMock.mockResolvedValue(AUTO);
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
const easyStartCalls = () =>
  publish.mock.calls.filter(([, type]) => type === "easy-start");

const aiPlan = (fields: Record<string, unknown> = {}) => ({
  entry: "Open the tax site",
  subtasks: ["Log in"],
  source: "ai" as const,
  release: jest.fn().mockResolvedValue(undefined),
  ...fields,
});

describe("the task changed while the plan was being made", () => {
  it("an entry typed meanwhile wins: nothing is written, the claim is given back", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    const plan = aiPlan();
    generate.mockImplementation(async () => {
      await touchRow(db, "task", task.id, { entry: "My own first step" });
      return plan;
    });

    const outcome = await simplifyTask({ taskId: task.id, reason: "create" });

    expect(outcome).toEqual({ status: "skipped", why: "failed" });
    expect(taskRow(db, task.id).entry).toBe("My own first step");
    expect(partsOf(task.id)).toHaveLength(0);
    expect(actions()).toHaveLength(0);
    expect(plan.release).toHaveBeenCalledTimes(1);
    expect(easyStartCalls()).toHaveLength(0);
  });

  it("a re-split of a task that was edited meanwhile is refused too, and left unstamped", async () => {
    const task = await seedTask(db, {
      title: "Do the whole tax return",
      entry: "Collect every document",
      rescheduleCount: 1,
    });
    const plan = aiPlan({ title: "File taxes" });
    generate.mockImplementation(async () => {
      await touchRow(db, "task", task.id, { title: "My own title" });
      return plan;
    });

    const outcome = await simplifyTask({
      taskId: task.id,
      reason: "rescheduled",
    });

    expect(outcome).toEqual({ status: "skipped", why: "failed" });
    expect(taskRow(db, task.id).title).toBe("My own title");
    expect(plan.release).toHaveBeenCalledTimes(1);
    expect(taskRow(db, task.id).simplifiedAt).toBeNull();
  });

  it("two jobs for one task: the second changes nothing", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());
    const first = await simplifyTask({ taskId: task.id, reason: "create" });
    const second = await simplifyTask({ taskId: task.id, reason: "create" });
    expect(first.status).toBe("simplified");
    expect(second).toEqual({ status: "skipped", why: "not_eligible" });
    expect(actions()).toHaveLength(1);
  });
});

describe("undo does not drop the person's work", () => {
  it("a subtask the person ticked after the rewrite makes undo refuse", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan({ subtasks: ["Collect payslips"] }));
    await simplifyTask({ taskId: task.id, reason: "create" });
    const part = partsOf(task.id)[0];
    await (
      db.client.taskPart as { update: (args: unknown) => Promise<unknown> }
    ).update({ where: { id: part.id }, data: { done: true } });

    const result = await undoAction(actions()[0].id as string, OWNER_ID);

    expect(result.status).toBe("undo_conflict");
    expect(partsOf(task.id)).toHaveLength(1);
    expect(taskRow(db, task.id).entry).toBe("Open the tax site");
  });

  it("undo starts the cooldown and clears the count: sweep and backfill leave the task alone", async () => {
    const task = await seedTask(db, {
      title: "Do the whole tax return",
      entry: "Collect every document",
      rescheduleCount: 1,
    });
    generate.mockResolvedValue(aiPlan({ title: "File taxes" }));
    await simplifyTask({ taskId: task.id, reason: "rescheduled" });
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);

    await undoAction(actions()[0].id as string, OWNER_ID);

    const back = taskRow(db, task.id);
    expect(back.title).toBe("Do the whole tax return");
    expect(back.rescheduleCount).toBe(0);
    expect((back.simplifiedAt as Date).toISOString()).toBe(NOW.toISOString());

    generate.mockClear();
    expect(
      await simplifyTask({ taskId: task.id, reason: "rescheduled" })
    ).toEqual({ status: "skipped", why: "not_eligible" });
    expect(await simplifyTask({ taskId: task.id, reason: "backfill" })).toEqual(
      { status: "skipped", why: "not_eligible" }
    );
    expect(generate).not.toHaveBeenCalled();
    expect(actions()).toHaveLength(1);
  });

  it("an undone first step is not given back by the backfill", async () => {
    const task = await seedTask(db, { title: "Old open task" });
    generate.mockResolvedValue(aiPlan());
    await simplifyTask({ taskId: task.id, reason: "backfill", quiet: true });
    await undoAction(actions()[0].id as string, OWNER_ID);
    expect(taskRow(db, task.id).entry).toBeNull();

    generate.mockClear();
    expect(await simplifyTask({ taskId: task.id, reason: "backfill" })).toEqual(
      { status: "skipped", why: "not_eligible" }
    );
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("projects kept out of easy start", () => {
  beforeEach(() =>
    settingsMock.mockResolvedValue({ mode: "auto", excludedProjectIds: ["p1"] })
  );

  it("a task in an excluded project is never given an entry or rewritten", async () => {
    const fresh = await seedTask(db, { title: "New", projectId: "p1" });
    const stuck = await seedTask(db, {
      title: "Old",
      entry: "Open it",
      rescheduleCount: 3,
      projectId: "p1",
    });
    expect(await simplifyTask({ taskId: fresh.id, reason: "create" })).toEqual({
      status: "skipped",
      why: "not_eligible",
    });
    expect(
      await simplifyTask({ taskId: stuck.id, reason: "rescheduled" })
    ).toEqual({ status: "skipped", why: "not_eligible" });
    expect(generate).not.toHaveBeenCalled();
    expect(actions()).toHaveLength(0);
  });

  it("another project is not affected", async () => {
    const task = await seedTask(db, { title: "New", projectId: "p2" });
    generate.mockResolvedValue(aiPlan());
    expect(
      await simplifyTask({ taskId: task.id, reason: "create" })
    ).toMatchObject({ status: "simplified" });
  });

  it("ideas on a day are not counted toward the overload cap and are never moved", async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
    ]);
    for (let i = 1; i <= 6; i += 1) {
      await seedTask(db, {
        title: `Task ${i}`,
        dueDate: TODAY,
        estimatedMinutes: 30,
        isAutoScheduled: true,
      });
    }
    // 6 tasks and 5 ideas: the cap sees 6, so nothing moves
    const ideas = [];
    for (let i = 1; i <= 5; i += 1) {
      ideas.push(
        await seedTask(db, {
          title: `Idea ${i}`,
          kind: "IDEA",
          dueDate: TODAY,
          estimatedMinutes: 30,
        })
      );
    }
    const outcome = await balanceOverloadedDays(OWNER_ID);
    expect(outcome.moved).toBe(0);
    for (const idea of ideas) {
      expect(taskRow(db, idea.id).kind).toBe("IDEA");
    }
  });

  it("a day with 7 tasks and 5 ideas moves one task, never an idea", async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
    ]);
    for (let i = 1; i <= 7; i += 1) {
      await seedTask(db, {
        title: `Task ${i}`,
        dueDate: TODAY,
        estimatedMinutes: 30,
        isAutoScheduled: true,
      });
    }
    const ideas = [];
    for (let i = 1; i <= 5; i += 1) {
      ideas.push(
        await seedTask(db, {
          title: `Idea ${i}`,
          kind: "IDEA",
          dueDate: TODAY,
          estimatedMinutes: 30,
        })
      );
    }
    const outcome = await balanceOverloadedDays(OWNER_ID);
    expect(outcome.moved).toBe(1);
    for (const idea of ideas) {
      expect((taskRow(db, idea.id).dueDate as Date).getTime()).toBe(
        TODAY.getTime()
      );
    }
  });

  it("a crowded day never moves a task from an excluded project", async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
    ]);
    const rows = [];
    for (let i = 1; i <= 8; i += 1) {
      rows.push(
        await seedTask(db, {
          title: `Task ${i}`,
          dueDate: TODAY,
          estimatedMinutes: 30,
          isAutoScheduled: true,
          priorityLevel: i > 6 ? "LOW" : "MEDIUM",
          // The two least important are kept out.
          projectId: i > 6 ? "p1" : null,
        })
      );
    }
    const outcome = await balanceOverloadedDays(OWNER_ID);
    expect(outcome.moved).toBe(2);
    for (const row of rows.slice(6)) {
      expect((taskRow(db, row.id).dueDate as Date).getTime()).toBe(
        TODAY.getTime()
      );
    }
  });
});

describe("suggest mode", () => {
  beforeEach(() =>
    settingsMock.mockResolvedValue({ mode: "suggest", excludedProjectIds: [] })
  );

  it('stores a proposal and asks "Simplify?"; the task is not touched', async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());

    const outcome = await simplifyTask({ taskId: task.id, reason: "create" });

    expect(outcome).toMatchObject({ status: "proposed", source: "ai" });
    expect(taskRow(db, task.id).entry).toBeNull();
    expect(partsOf(task.id)).toHaveLength(0);
    expect(actions()).toHaveLength(0);
    expect(db.tables.easyStartProposal).toHaveLength(1);
    expect(db.tables.easyStartProposal[0]).toMatchObject({
      taskId: task.id,
      status: "pending",
      entry: "Open the tax site",
      baseTitle: "Prepare tax return",
    });
    const calls = easyStartCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({
      proposalId: db.tables.easyStartProposal[0].id,
      message: expect.stringMatching(/^Simplify\?/),
    });
    expect(calls[0][2]).not.toHaveProperty("actionId");
  });

  it("one pending proposal per task", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());
    await simplifyTask({ taskId: task.id, reason: "create" });
    expect(await simplifyTask({ taskId: task.id, reason: "create" })).toEqual({
      status: "skipped",
      why: "not_eligible",
    });
    expect(db.tables.easyStartProposal).toHaveLength(1);
  });

  it("Apply runs the same op as the person, and it is undoable", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());
    await simplifyTask({ taskId: task.id, reason: "create" });
    const proposal = db.tables.easyStartProposal[0];

    const applied = await applyProposal(proposal.id, OWNER_ID);

    expect(applied).toMatchObject({ status: "applied" });
    expect(taskRow(db, task.id).entry).toBe("Open the tax site");
    expect(partsOf(task.id).map((p) => p.title)).toEqual(["Log in"]);
    expect(actions()[0]).toMatchObject({ op: "task.simplify", actor: "user" });
    expect(db.tables.easyStartProposal[0]).toMatchObject({
      status: "applied",
      actionId: actions()[0].id,
    });

    await undoAction(actions()[0].id as string, OWNER_ID);
    expect(taskRow(db, task.id).entry).toBeNull();
    expect(partsOf(task.id)).toHaveLength(0);

    // a second Apply finds nothing pending
    expect(await applyProposal(proposal.id, OWNER_ID)).toEqual({
      status: "not_found",
    });
  });

  it("a task the person edited since is stale: not applied", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());
    await simplifyTask({ taskId: task.id, reason: "create" });
    await touchRow(db, "task", task.id, { entry: "My own step" });

    const result = await applyProposal(
      db.tables.easyStartProposal[0].id,
      OWNER_ID
    );

    expect(result).toEqual({ status: "stale" });
    expect(taskRow(db, task.id).entry).toBe("My own step");
    expect(db.tables.easyStartProposal[0].status).toBe("stale");
    expect(actions()).toHaveLength(0);
  });

  it("a task completed or archived since is stale: not applied", async () => {
    for (const change of [{ status: "completed" }, { isArchived: true }]) {
      db.tables.easyStartProposal.length = 0;
      const task = await seedTask(db, { title: "Prepare tax return" });
      generate.mockResolvedValue(aiPlan());
      await simplifyTask({ taskId: task.id, reason: "create" });
      await touchRow(db, "task", task.id, change);

      const result = await applyProposal(
        db.tables.easyStartProposal[0].id,
        OWNER_ID
      );

      expect(result).toEqual({ status: "stale" });
      expect(db.tables.easyStartProposal[0].status).toBe("stale");
      expect(taskRow(db, task.id).entry ?? null).toBeNull();
    }
  });

  it("a held (deferred) generation writes nothing and stamps nothing", async () => {
    settingsMock.mockResolvedValue(AUTO);
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(
      aiPlan({ deferred: true, source: "fallback", entry: "x" })
    );
    const outcome = await simplifyTask({
      taskId: task.id,
      reason: "backfill",
      holdHostedAi: true,
    });
    expect(outcome).toEqual({ status: "skipped", why: "deferred" });
    expect(generate.mock.calls[0][0]).toMatchObject({ holdHostedAi: true });
    expect(taskRow(db, task.id).simplifiedAt).toBeNull();
    expect(taskRow(db, task.id).entry ?? null).toBeNull();
    expect(actions()).toHaveLength(0);
  });

  it("someone else cannot apply it, and Dismiss closes it", async () => {
    const task = await seedTask(db, { title: "Prepare tax return" });
    generate.mockResolvedValue(aiPlan());
    await simplifyTask({ taskId: task.id, reason: "create" });
    const id = db.tables.easyStartProposal[0].id as string;

    expect(await applyProposal(id, "user-9")).toEqual({ status: "not_found" });
    expect(await dismissProposal(id, "user-9")).toBe(false);
    expect(await dismissProposal(id, OWNER_ID)).toBe(true);
    expect(db.tables.easyStartProposal[0].status).toBe("dismissed");
    expect(taskRow(db, task.id).entry).toBeNull();
  });

  it("the overloaded-day rule does nothing in suggest mode", async () => {
    jest
      .mocked(loadSpreadDays)
      .mockResolvedValue([{ date: TOMORROW, free: 900 }]);
    for (let i = 0; i < 9; i += 1) {
      await seedTask(db, {
        title: `t${i}`,
        dueDate: TODAY,
        isAutoScheduled: true,
      });
    }
    expect(await balanceOverloadedDays(OWNER_ID)).toMatchObject({
      moved: 0,
      skipped: "off",
    });
    expect(actions()).toHaveLength(0);
  });
});

describe("backfill: an existing task with no entry", () => {
  it("gets an entry once, undoable, and the batch announces instead of the task", async () => {
    const task = await seedTask(db, { title: "Old open task" });
    generate.mockResolvedValue(aiPlan({ subtasks: [] }));

    const outcome = await simplifyTask({
      taskId: task.id,
      reason: "backfill",
      quiet: true,
    });

    expect(outcome).toMatchObject({ status: "simplified" });
    expect(taskRow(db, task.id).entry).toBe("Open the tax site");
    expect(taskRow(db, task.id).simplifiedAt).toBeInstanceOf(Date);
    expect(easyStartCalls()).toHaveLength(0);
    await undoAction(actions()[0].id as string, OWNER_ID);
    expect(taskRow(db, task.id).entry).toBeNull();
  });

  it("a task already looked at is not backfilled again", async () => {
    const task = await seedTask(db, {
      title: "Old open task",
      simplifiedAt: new Date("2026-10-20T00:00:00Z"),
    });
    expect(await simplifyTask({ taskId: task.id, reason: "backfill" })).toEqual(
      { status: "skipped", why: "not_eligible" }
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("a task that is not eligible is stamped so it leaves the set", async () => {
    const task = await seedTask(db, { title: "Old", entry: "Open it" });
    await simplifyTask({ taskId: task.id, reason: "backfill" });
    expect(taskRow(db, task.id).simplifiedAt).toBeInstanceOf(Date);
  });
});

describe("stampLookedAt", () => {
  it("stamps only when nobody changed the stamp meanwhile", async () => {
    const task = await seedTask(db, { title: "Old" });
    await stampLookedAt({ id: task.id, simplifiedAt: null }, NOW);
    expect((taskRow(db, task.id).simplifiedAt as Date).toISOString()).toBe(
      NOW.toISOString()
    );
    await stampLookedAt(
      { id: task.id, simplifiedAt: null },
      new Date("2026-11-01T00:00:00Z")
    );
    expect((taskRow(db, task.id).simplifiedAt as Date).toISOString()).toBe(
      NOW.toISOString()
    );
  });
});

describe("a moved task is held, not pulled back", () => {
  beforeEach(() => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
    ]);
  });

  const seedCrowd = async (fields: (i: number) => Record<string, unknown>) => {
    const rows = [];
    for (let i = 1; i <= 8; i += 1) {
      rows.push(
        await seedTask(db, {
          title: `Task ${i}`,
          estimatedMinutes: 30,
          isAutoScheduled: true,
          priorityLevel: i > 6 ? "LOW" : "MEDIUM",
          ...fields(i),
        })
      );
    }
    return rows;
  };

  it("sets the not-before date, leaves the reschedule count alone, and undo clears it", async () => {
    const rows = await seedCrowd(() => ({ dueDate: TODAY }));
    await balanceOverloadedDays(OWNER_ID);
    for (const row of rows.slice(6)) {
      const moved = taskRow(db, row.id);
      expect((moved.postponedUntil as Date).toISOString()).toBe(
        "2026-10-23T22:00:00.000Z"
      );
      // A move the app made is not a postponement the person made.
      expect(moved.rescheduleCount).toBe(0);
    }
    expect(taskRow(db, rows[0].id).postponedUntil ?? null).toBeNull();

    await undoAction(actions()[0].id as string, OWNER_ID);
    for (const row of rows.slice(6)) {
      expect(taskRow(db, row.id).postponedUntil ?? null).toBeNull();
    }
  });

  it("a task with no due date is not given one", async () => {
    const rows = await seedCrowd(() => ({ scheduledStart: NOW }));
    await balanceOverloadedDays(OWNER_ID);
    for (const row of rows.slice(6)) {
      expect(taskRow(db, row.id).dueDate).toBeNull();
      expect(taskRow(db, row.id).postponedUntil).toBeInstanceOf(Date);
    }
  });
});

describe("each workspace is balanced on its own", () => {
  beforeEach(async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-10-23", free: 900 },
      { date: TOMORROW, free: 900 },
    ]);
    await db.seed("workspaceMember", {
      userId: OWNER_ID,
      workspaceId: "ws-2",
      role: WorkspaceRole.EDITOR,
    });
    workspaceAuth.resolveWorkspaceAccess.mockImplementation(
      async (args: { requestedWorkspaceId?: string }) =>
        access(WorkspaceRole.OWNER, args.requestedWorkspaceId ?? "ws-1")
    );
  });

  const crowd = async (workspaceId: string, count: number) => {
    for (let i = 1; i <= count; i += 1) {
      await seedTask(db, {
        title: `${workspaceId}-${i}`,
        workspaceId,
        dueDate: TODAY,
        estimatedMinutes: 30,
        isAutoScheduled: true,
        priorityLevel: i > count - 2 ? "LOW" : "MEDIUM",
      });
    }
  };

  it("4 tasks here and 4 there is not a crowded day anywhere", async () => {
    await crowd("ws-1", 4);
    await crowd("ws-2", 4);
    expect(await balanceOverloadedDays(OWNER_ID)).toMatchObject({ moved: 0 });
  });

  it("a crowded second workspace is eased without touching the first", async () => {
    await crowd("ws-1", 3);
    await crowd("ws-2", 8);
    const outcome = await balanceOverloadedDays(OWNER_ID);
    expect(outcome.moved).toBe(2);
    const moved = db.tables.task.filter(
      (row) => (row.dueDate as Date).getTime() > TODAY.getTime()
    );
    expect(moved.map((row) => row.workspaceId)).toEqual(["ws-2", "ws-2"]);
  });
});
