import { runOp, undoAction } from "..";
import { endOfWeekKey } from "../ops/starter";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, access, opts } from "./harness";

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
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn(),
  canCreateHabit: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return {
    ...actual,
    resolveWorkspaceAccess: jest.fn(async () => access()),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const entitlements = require("@/lib/entitlements");

let db = mockState.db;

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  entitlements.getPlan.mockResolvedValue("PRO");
  entitlements.canCreateHabit.mockResolvedValue({
    allowed: true,
    limit: null,
    used: 0,
  });
});

const INPUT = {
  tasks: [
    { title: "Reply to buyers", group: "today", estimateMinutes: 15 },
    { title: "Plan the week", group: "week", estimateMinutes: 30 },
  ],
  habits: [{ title: "Duolingo", perWeek: 7 }],
  projects: [
    {
      name: "German B1 course",
      firstStep: "Book the placement test",
      horizon: "until Dec",
    },
    { name: "Autumn stock" },
  ],
};

describe("starter.create", () => {
  it("creates tasks, habits and projects as one action", async () => {
    const run = await runOp<{
      counts: { tasks: number; habits: number; projects: number };
      projects: Array<{ id: string; firstStepTaskId: string | null }>;
    }>("starter.create", INPUT, opts());

    expect(run.result.counts).toEqual({ tasks: 2, habits: 1, projects: 2 });
    // one AgentAction for everything
    expect(db.tables.agentAction).toHaveLength(1);
    expect(run.undoable).toBe(true);

    // 2 tasks + 1 first step
    expect(db.tables.task).toHaveLength(3);
    const reply = db.tables.task.find((t) => t.title === "Reply to buyers")!;
    expect(reply).toMatchObject({
      estimatedMinutes: 15,
      isAutoScheduled: true,
      status: "todo",
    });
    expect(reply.dueDate).toBeInstanceOf(Date);

    expect(db.tables.habit).toHaveLength(1);
    expect(db.tables.habit[0]).toMatchObject({
      title: "Duolingo",
      targetOccurrencesPerWeek: 7,
      workspaceId: "ws-1",
    });

    expect(db.tables.project).toHaveLength(2);
    const german = db.tables.project.find(
      (p) => p.name === "German B1 course"
    )!;
    expect(german.description).toBe("until Dec");
    const step = db.tables.task.find(
      (t) => t.title === "Book the placement test"
    )!;
    expect(step.projectId).toBe(german.id);
    expect(run.result.projects[0].firstStepTaskId).toBe(step.id);
    // a project without a step gets none
    expect(run.result.projects[1].firstStepTaskId).toBeNull();
  });

  it("puts this week's tasks due within the week, today's due today", async () => {
    await runOp("starter.create", INPUT, opts());
    const today = db.tables.task.find((t) => t.title === "Reply to buyers")!;
    const week = db.tables.task.find((t) => t.title === "Plan the week")!;
    expect((week.dueDate as Date).getTime()).toBeGreaterThanOrEqual(
      (today.dueDate as Date).getTime()
    );
    expect(
      (week.dueDate as Date).getTime() - (today.dueDate as Date).getTime()
    ).toBeLessThan(7 * 24 * 3_600_000);
  });

  it("uses an agent-suggested day only inside the week", async () => {
    const ahead = new Date(Date.now() + 40 * 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    await runOp(
      "starter.create",
      {
        tasks: [{ title: "Far away", group: "week", dueDay: ahead }],
      },
      opts()
    );
    const task = db.tables.task.find((t) => t.title === "Far away")!;
    expect((task.dueDate as Date).getTime() - Date.now()).toBeLessThan(
      8 * 24 * 3_600_000
    );
  });

  it("is undone as a whole by one undo", async () => {
    const run = await runOp("starter.create", INPUT, opts());
    const undone = await undoAction(run.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(db.tables.task.every((t) => t.isArchived === true)).toBe(true);
    expect(db.tables.project.every((p) => p.status === "archived")).toBe(true);
    expect(db.tables.habit.every((h) => h.archivedAt instanceof Date)).toBe(
      true
    );
    expect(db.tables.agentAction).toHaveLength(1);
    expect(db.tables.agentAction[0].status).toBe("undone");
  });

  it("is refused on a Free account and writes nothing", async () => {
    entitlements.getPlan.mockResolvedValue("FREE");
    await expect(runOp("starter.create", INPUT, opts())).rejects.toMatchObject({
      code: "UPGRADE_REQUIRED",
    });
    expect(db.tables.task).toHaveLength(0);
    expect(db.tables.agentAction).toHaveLength(0);
  });

  it("refuses an empty request", async () => {
    await expect(runOp("starter.create", {}, opts())).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("endOfWeekKey", () => {
  it("ends the week on Sunday", () => {
    expect(endOfWeekKey("2026-10-19")).toBe("2026-10-25"); // Monday
    expect(endOfWeekKey("2026-10-25")).toBe("2026-10-25"); // Sunday
    expect(endOfWeekKey("2026-10-24")).toBe("2026-10-25"); // Saturday
  });
});
