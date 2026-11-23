import { queueEasyStart } from "@/services/easy-start/queue";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import { ideaCardsEnabled } from "@/lib/feature-flags";

import { OpError, runOp, undoAction } from "..";
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
const iso = (v: unknown) => (v ? (v as Date).toISOString() : null);
/** The person, through the app. */
const run = <T>(name: string, input: unknown) =>
  runOp<T>(name, input, { ...opts(), actor: "user" });

// Monday 23 November 2026, 10:00 in Zurich (CET, UTC+1).
const NOW = new Date("2026-11-23T09:00:00.000Z");
const TODAY_START = "2026-11-22T23:00:00.000Z";
const DAY = 86_400_000;

function setClock(now: Date) {
  jest.useFakeTimers({
    now,
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
}

beforeEach(async () => {
  jest.clearAllMocks();
  setClock(NOW);
  mockState.db = createFakePrisma();
  db = mockState.db;
  jest.mocked(ideaCardsEnabled).mockResolvedValue(true);
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(async () =>
    access(WorkspaceRole.OWNER)
  );
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Zurich",
  });
  jest.mocked(loadSpreadDays).mockResolvedValue([
    { date: "2026-11-23", free: 240 },
    { date: "2026-11-24", free: 240 },
    { date: "2026-11-25", free: 240 },
  ]);
  jest.mocked(scheduleAllTasksForUser).mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

const seedIdea = (fields: Record<string, unknown> = {}) =>
  seedTask(db, {
    title: "Check AI agents news",
    kind: "IDEA",
    ideaSource: "user",
    isAutoScheduled: false,
    ...fields,
  });

describe("an idea is a kind of task that is never late", () => {
  it("idea.create stores an idea with no date and no schedule", async () => {
    const out = await run<{ task: Record<string, unknown> }>("idea.create", {
      title: "Check AI agents news",
      estimateMinutes: 15,
    });
    const row = taskRow(db, out.result.task.id as string);
    expect(row).toMatchObject({
      kind: "IDEA",
      ideaSource: "user",
      status: "todo",
      dueDate: null,
      scheduledStart: null,
      isAutoScheduled: false,
      estimatedMinutes: 15,
    });
    expect(out.result.task).toMatchObject({ kind: "idea", dueDate: null });
    // no reminder is made for it
    expect(db.tables.taskReminder).toHaveLength(0);
  });

  it("an MCP client's idea has the source agent", async () => {
    const out = await runOp<{ task: { id: string } }>(
      "idea.create",
      { title: "Watch the Figma config talk" },
      { ...opts(), actor: "mcp" }
    );
    expect(taskRow(db, out.result.task.id).ideaSource).toBe("agent");
  });

  it("task.create with kind idea makes an idea, and refuses a date or a schedule", async () => {
    const made = await run<{ task: { id: string } }>("task.create", {
      title: "Try the new editor",
      kind: "idea",
    });
    expect(taskRow(db, made.result.task.id).kind).toBe("IDEA");
    for (const extra of [
      { dueDate: "2026-11-25" },
      { start: "2026-11-25T10:00" },
      { recurrenceRule: "FREQ=DAILY" },
      { autoSchedule: true },
    ]) {
      await expect(
        run("task.create", { title: "Dated idea", kind: "idea", ...extra })
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(db.tables.task.filter((r) => r.title === "Dated idea")).toHaveLength(
      0
    );
  });

  it("task.update refuses a date on an idea and leaves it unchanged", async () => {
    const idea = await seedIdea();
    for (const patch of [
      { dueDate: "2026-11-25" },
      { deadline: "2026-11-25" },
      { start: "2026-11-25T10:00" },
      { pinned: true },
    ]) {
      await expect(
        run("task.update", { taskId: idea.id, ...patch })
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(taskRow(db, idea.id)).toMatchObject({ dueDate: null, kind: "IDEA" });
    // a plain edit still works
    await run("task.update", { taskId: idea.id, title: "Check the news" });
    expect(taskRow(db, idea.id).title).toBe("Check the news");
  });

  it("an idea cannot be completed", async () => {
    const idea = await seedIdea();
    await expect(
      run("task.complete", { taskId: idea.id })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(taskRow(db, idea.id).status).toBe("todo");
  });

  it("task.list returns tasks only unless asked for ideas", async () => {
    await seedTask(db, { title: "Real task" });
    await seedIdea();
    const only = await run<{ tasks: { title: string }[] }>("task.list", {});
    expect(only.result.tasks.map((t) => t.title)).toEqual(["Real task"]);
    const ideas = await run<{ tasks: { title: string; kind: string }[] }>(
      "task.list",
      { kind: "idea" }
    );
    expect(ideas.result.tasks.map((t) => t.kind)).toEqual(["idea"]);
    const any = await run<{ tasks: unknown[] }>("task.list", { kind: "any" });
    expect(any.result.tasks).toHaveLength(2);
  });

  it("task.get reports kind", async () => {
    const idea = await seedIdea();
    const got = await run<{ task: { kind: string } }>("task.get", {
      taskId: idea.id,
    });
    expect(got.result.task.kind).toBe("idea");
  });

  it("idea.list pages ideas by state and never returns tasks", async () => {
    await seedTask(db, { title: "Real task" });
    const a = await seedIdea({ title: "A" });
    const b = await seedIdea({
      title: "B",
      ideaSnoozedUntil: new Date(NOW.getTime() + 3 * DAY),
    });
    await seedIdea({ title: "C", isArchived: true });
    const ready = await run<{ ideas: { id: string }[] }>("idea.list", {});
    expect(ready.result.ideas.map((i) => i.id)).toEqual([a.id]);
    const snoozed = await run<{ ideas: { id: string }[] }>("idea.list", {
      state: "snoozed",
    });
    expect(snoozed.result.ideas.map((i) => i.id)).toEqual([b.id]);
    const all = await run<{ ideas: unknown[]; nextCursor: string | null }>(
      "idea.list",
      { state: "all", limit: 2 }
    );
    expect(all.result.ideas).toHaveLength(2);
    expect(all.result.nextCursor).not.toBeNull();
  });
});

describe("a task and an idea convert in both directions", () => {
  it("an overdue task becomes an idea, and Undo brings back the task and its due date", async () => {
    const due = new Date("2026-11-21T00:00:00.000Z");
    const task = await seedTask(db, {
      title: "Read AI agents news",
      dueDate: due,
      deadline: due,
      scheduledStart: new Date("2026-11-21T10:00:00.000Z"),
      scheduledEnd: new Date("2026-11-21T10:30:00.000Z"),
      isAutoScheduled: true,
      hardDeadline: false,
    });
    await db.seed("scheduledBlock", {
      taskId: task.id,
      userId: OWNER_ID,
      start: new Date("2026-11-21T10:00:00.000Z"),
      end: new Date("2026-11-21T10:30:00.000Z"),
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: false,
    });
    const reminder = await db.seed("taskReminder", {
      taskId: task.id,
      userId: OWNER_ID,
      canceledAt: null,
      deliveredAt: null,
    });

    const out = await run<{ task: Record<string, unknown> }>("idea.convert", {
      taskId: task.id,
      to: "idea",
    });
    expect(taskRow(db, task.id)).toMatchObject({
      kind: "IDEA",
      ideaSource: "user",
      dueDate: null,
      deadline: null,
      scheduledStart: null,
      scheduledEnd: null,
      isAutoScheduled: false,
    });
    expect(db.tables.scheduledBlock).toHaveLength(0);
    expect(taskRow(db, task.id).ideaCheckedAt).toBeInstanceOf(Date);
    expect(
      db.tables.taskReminder.find((r) => r.id === reminder.id)?.canceledAt
    ).toBeInstanceOf(Date);

    const undone = await undoAction(out.actionId as string, OWNER_ID, "user");
    expect(undone.status).toBe("undone");
    const back = taskRow(db, task.id);
    expect(back).toMatchObject({ kind: "TASK", ideaSource: null });
    expect(iso(back.dueDate)).toBe(due.toISOString());
    expect(iso(back.deadline)).toBe(due.toISOString());
    expect(db.tables.scheduledBlock).toHaveLength(1);
    expect(
      db.tables.taskReminder.find((r) => r.id === reminder.id)?.canceledAt
    ).toBeNull();
    // an undone conversion is not redone by the sweep
    expect(back.ideaCheckedAt).toBeInstanceOf(Date);
  });

  it("a sweep conversion carries the source converted", async () => {
    const task = await seedTask(db, { title: "Watch a breakdown" });
    await run("idea.convert", {
      taskId: task.id,
      to: "idea",
      source: "converted",
    });
    expect(taskRow(db, task.id).ideaSource).toBe("converted");
  });

  it("task.update with kind converts, on its own", async () => {
    const task = await seedTask(db, { title: "Read news" });
    await expect(
      run("task.update", { taskId: task.id, kind: "idea", title: "Other" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await run("task.update", { taskId: task.id, kind: "idea" });
    expect(taskRow(db, task.id).kind).toBe("IDEA");
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      "a repeating task",
      { isRecurring: true, recurrenceRule: "FREQ=DAILY" },
      "INVALID_INPUT",
    ],
    ["a habit occurrence", { habitId: "h1" }, "INVALID_INPUT"],
    ["a synced task", { externalTaskId: "g1" }, "INVALID_INPUT"],
    ["an example", { isSample: true }, "INVALID_INPUT"],
    ["a completed task", { status: "completed" }, "CONFLICT"],
  ])("refuses to make %s an idea", async (_name, fields, code) => {
    const task = await seedTask(db, fields);
    await expect(
      run("idea.convert", { taskId: task.id, to: "idea" })
    ).rejects.toMatchObject({ code });
    expect(taskRow(db, task.id).kind).toBe("TASK");
  });

  it("refuses a task that is in the day plan", async () => {
    const task = await seedTask(db);
    const plan = await db.seed("dayPlan", {
      userId: OWNER_ID,
      status: "active",
    });
    await db.seed("dayPlanItem", { planId: plan.id, taskId: task.id });
    await expect(
      run("idea.convert", { taskId: task.id, to: "idea" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("an idea made a task has no placement, is open, and Undo makes it an idea", async () => {
    const idea = await seedIdea({
      ideaSnoozedUntil: new Date(NOW.getTime() + 2 * DAY),
    });
    const out = await run("idea.convert", { taskId: idea.id, to: "task" });
    expect(taskRow(db, idea.id)).toMatchObject({
      kind: "TASK",
      ideaSnoozedUntil: null,
      scheduledStart: null,
      dueDate: null,
    });
    expect(scheduleAllTasksForUser).not.toHaveBeenCalled();
    await undoAction(out.actionId as string, OWNER_ID, "user");
    expect(taskRow(db, idea.id).kind).toBe("IDEA");
  });

  it("converting twice changes nothing the second time", async () => {
    const task = await seedTask(db);
    await run("idea.convert", { taskId: task.id, to: "idea" });
    const again = await run<{ changed: boolean }>("idea.convert", {
      taskId: task.id,
      to: "idea",
    });
    expect(again.result.changed).toBe(false);
    expect(again.undoable).toBe(false);
  });
});

describe("skip", () => {
  it("hides the idea for 7 days and counts the skip", async () => {
    const idea = await seedIdea();
    const out = await run<{ archived: boolean }>("idea.skip", {
      taskId: idea.id,
    });
    expect(out.result.archived).toBe(false);
    expect(taskRow(db, idea.id)).toMatchObject({
      ideaSkipCount: 1,
      isArchived: false,
    });
    expect(iso(taskRow(db, idea.id).ideaSnoozedUntil)).toBe(
      "2026-11-30T09:00:00.000Z"
    );
    expect(recordActivation).toHaveBeenCalledWith("idea_skipped", OWNER_ID, {
      source: "user",
      skipCount: 1,
    });
    await undoAction(out.actionId as string, OWNER_ID, "user");
    expect(taskRow(db, idea.id)).toMatchObject({
      ideaSkipCount: 0,
      ideaSnoozedUntil: null,
    });
  });

  it("the 3rd skip archives it, and it is still listed with state all", async () => {
    const idea = await seedIdea({ ideaSkipCount: 2 });
    const out = await run<{ archived: boolean }>("idea.skip", {
      taskId: idea.id,
    });
    expect(out.result.archived).toBe(true);
    expect(taskRow(db, idea.id)).toMatchObject({
      isArchived: true,
      ideaSkipCount: 3,
    });
    const all = await run<{ ideas: { id: string }[] }>("idea.list", {
      state: "all",
    });
    expect(all.result.ideas.map((i) => i.id)).toEqual([idea.id]);
    await undoAction(out.actionId as string, OWNER_ID, "user");
    expect(taskRow(db, idea.id).isArchived).toBe(false);
  });

  it("only an idea can be skipped", async () => {
    const task = await seedTask(db);
    await expect(run("idea.skip", { taskId: task.id })).rejects.toBeInstanceOf(
      OpError
    );
  });
});

describe("take", () => {
  /** The scheduler places the one task at 10:40 today. */
  function schedulerPlaces(start: string, minutes = 30) {
    jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
      for (const row of db.tables.task) {
        if (row.kind === "TASK" && row.isAutoScheduled && !row.scheduledStart) {
          row.scheduledStart = new Date(start);
          row.scheduledEnd = new Date(
            new Date(start).getTime() + minutes * 60_000
          );
          row.updatedAt = db.tick();
        }
      }
      return [];
    });
  }

  it("makes a task and the scheduler places it today, with no due date", async () => {
    const idea = await seedIdea({
      estimatedMinutes: 15,
      ideaSkipCount: 1,
      ideaLastShownAt: NOW,
    });
    schedulerPlaces("2026-11-23T09:40:00.000Z", 15);
    const out = await run<{
      placed: { start: string; today: boolean } | null;
      day: string | null;
    }>("idea.take", { taskId: idea.id });
    const row = taskRow(db, idea.id);
    expect(row).toMatchObject({
      kind: "TASK",
      status: "todo",
      isAutoScheduled: true,
      dueDate: null,
      estimatedMinutes: 15,
      postponedUntil: null,
    });
    // the last shown stamp stays, so the day's cap still counts it
    expect(iso(row.ideaLastShownAt)).toBe(NOW.toISOString());
    expect(out.result.placed).toMatchObject({
      start: "2026-11-23T09:40:00.000Z",
      today: true,
    });
    expect(out.result.day).toBe("2026-11-23");
    expect(scheduleAllTasksForUser).toHaveBeenCalledWith(OWNER_ID, {
      workspaceId: "ws-1",
    });
    expect(recordActivation).toHaveBeenCalledWith("idea_taken", OWNER_ID, {
      source: "user",
      skipCount: 1,
      placedToday: true,
    });
  });

  it("an idea with no estimate is 30 minutes", async () => {
    const idea = await seedIdea();
    await run("idea.take", { taskId: idea.id });
    expect(taskRow(db, idea.id)).toMatchObject({
      estimatedMinutes: 30,
      duration: 30,
    });
  });

  it("goes to the first later day with room when today has none", async () => {
    jest.mocked(loadSpreadDays).mockResolvedValue([
      { date: "2026-11-23", free: 0 },
      { date: "2026-11-24", free: 240 },
    ]);
    const idea = await seedIdea();
    schedulerPlaces("2026-11-24T08:00:00.000Z");
    const out = await run<{ day: string; placed: { today: boolean } }>(
      "idea.take",
      { taskId: idea.id }
    );
    expect(out.result.day).toBe("2026-11-24");
    expect(out.result.placed.today).toBe(false);
    expect(iso(taskRow(db, idea.id).postponedUntil)).toBe(
      "2026-11-23T23:00:00.000Z"
    );
    expect(taskRow(db, idea.id).dueDate).toBeNull();
  });

  it("a day that already holds the day limit of tasks has no room", async () => {
    for (let i = 0; i < 6; i += 1) {
      await seedTask(db, {
        title: `Task ${i}`,
        scheduledStart: new Date("2026-11-23T11:00:00.000Z"),
      });
    }
    const idea = await seedIdea();
    const out = await run<{ day: string }>("idea.take", { taskId: idea.id });
    expect(out.result.day).toBe("2026-11-24");
  });

  it("an idea with no room anywhere is still a task the scheduler picks up later", async () => {
    jest
      .mocked(loadSpreadDays)
      .mockResolvedValue([{ date: "2026-11-23", free: 0 }]);
    const idea = await seedIdea();
    const out = await run<{ day: string | null; placed: unknown }>(
      "idea.take",
      { taskId: idea.id }
    );
    expect(out.result.day).toBeNull();
    expect(out.result.placed).toBeNull();
    expect(taskRow(db, idea.id)).toMatchObject({
      kind: "TASK",
      isAutoScheduled: true,
    });
  });

  it("a scheduler that fails does not undo the take", async () => {
    jest
      .mocked(scheduleAllTasksForUser)
      .mockRejectedValue(new Error("settings missing"));
    const idea = await seedIdea();
    await run("idea.take", { taskId: idea.id });
    expect(taskRow(db, idea.id).kind).toBe("TASK");
  });

  it("easy start sees an ordinary new task", async () => {
    const idea = await seedIdea();
    await run("idea.take", { taskId: idea.id });
    expect(queueEasyStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: idea.id })
    );
  });

  it("Undo makes it an idea again with its old state and no placement", async () => {
    const snoozed = new Date(NOW.getTime() - DAY);
    const idea = await seedIdea({
      ideaSnoozedUntil: snoozed,
      ideaSkipCount: 1,
      estimatedMinutes: null,
    });
    schedulerPlaces("2026-11-23T09:40:00.000Z");
    const out = await run("idea.take", { taskId: idea.id });
    await db.seed("scheduledBlock", {
      taskId: idea.id,
      userId: OWNER_ID,
      start: new Date("2026-11-23T09:40:00.000Z"),
      end: new Date("2026-11-23T10:10:00.000Z"),
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: false,
    });
    const undone = await undoAction(out.actionId as string, OWNER_ID, "user");
    expect(undone.status).toBe("undone");
    expect(taskRow(db, idea.id)).toMatchObject({
      kind: "IDEA",
      isAutoScheduled: false,
      scheduledStart: null,
      scheduledEnd: null,
      ideaSkipCount: 1,
      estimatedMinutes: null,
      postponedUntil: null,
    });
    expect(iso(taskRow(db, idea.id).ideaSnoozedUntil)).toBe(
      snoozed.toISOString()
    );
    expect(db.tables.scheduledBlock).toHaveLength(0);
  });

  it("an archived idea or a task cannot be taken", async () => {
    const archived = await seedIdea({ isArchived: true });
    await expect(
      run("idea.take", { taskId: archived.id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const task = await seedTask(db);
    await expect(run("idea.take", { taskId: task.id })).rejects.toBeInstanceOf(
      OpError
    );
  });
});

describe("idea.cards", () => {
  type Cards = {
    day: string;
    cards: { id: string; title: string; after: number; minutes: number }[];
    none?: string;
  };
  const cards = (input: Record<string, unknown> = {}) =>
    run<Cards>("idea.cards", { visibleTasks: 8, ...input });

  it("returns at most 2 a day, and the same 2 on every read", async () => {
    for (let i = 0; i < 10; i += 1) {
      await seedIdea({ title: `Idea ${i}` });
    }
    const first = await cards();
    expect(first.result.cards).toHaveLength(2);
    expect(first.result.day).toBe("2026-11-23");
    const ids = first.result.cards.map((c) => c.id);
    for (let i = 0; i < 2; i += 1) {
      const again = await cards();
      expect(again.result.cards.map((c) => c.id)).toEqual(ids);
    }
    // each shown card is stamped
    expect(db.tables.task.filter((r) => r.ideaLastShownAt).length).toBe(2);
  });

  it("gives each card its project, its minutes and a position hint", async () => {
    const project = await db.seed("project", {
      name: "Learning",
      color: "#8b6cf0",
      workspaceId: "ws-1",
    });
    await seedIdea({ projectId: project.id, estimatedMinutes: 15 });
    await seedIdea({ title: "Second" });
    const out = await cards();
    expect(out.result.cards[0]).toMatchObject({
      title: "Check AI agents news",
      project: "Learning",
      projectId: project.id,
      hue: "#8b6cf0",
      minutes: 15,
      after: 2,
      source: "user",
    });
    expect(out.result.cards[1]).toMatchObject({
      project: null,
      hue: null,
      minutes: 30,
      after: 5,
    });
  });

  it("puts a card at the end with few tasks and shows one on an empty day", async () => {
    await seedIdea({ title: "A" });
    await seedIdea({ title: "B" });
    const few = await cards({ visibleTasks: 1 });
    expect(few.result.cards.map((c) => c.after)).toEqual([1, 1]);

    mockState.db = createFakePrisma();
    db = mockState.db;
    await db.seed("userSettings", {
      userId: OWNER_ID,
      timeZone: "Europe/Zurich",
    });
    await seedIdea({ title: "A" });
    await seedIdea({ title: "B" });
    const empty = await cards({ visibleTasks: 0 });
    expect(empty.result.cards).toHaveLength(1);
    expect(empty.result.cards[0].after).toBe(0);
  });

  it("counts today's tasks itself when the client does not say", async () => {
    await seedTask(db, {
      scheduledStart: new Date("2026-11-23T11:00:00.000Z"),
    });
    await seedIdea();
    const out = await run<Cards>("idea.cards", {});
    expect(out.result.cards[0].after).toBe(1);
  });

  it("least recently shown first, never-shown ahead of the rest", async () => {
    const old = await seedIdea({
      title: "Old",
      ideaLastShownAt: new Date(NOW.getTime() - 9 * DAY),
    });
    const fresh = await seedIdea({
      title: "Fresh",
      ideaLastShownAt: new Date(NOW.getTime() - 2 * DAY),
    });
    const never = await seedIdea({ title: "Never" });
    await seedIdea({
      title: "Newest",
      ideaLastShownAt: new Date(NOW.getTime() - 1 * DAY),
    });
    const out = await cards();
    expect(out.result.cards.map((c) => c.id).sort()).toEqual(
      [never.id, old.id].sort()
    );
    expect(out.result.cards.map((c) => c.id)).not.toContain(fresh.id);
  });

  it("skipping one of the 2 does not open a third", async () => {
    for (let i = 0; i < 5; i += 1) await seedIdea({ title: `Idea ${i}` });
    const first = await cards();
    await run("idea.skip", { taskId: first.result.cards[0].id });
    const after = await cards();
    expect(after.result.cards.map((c) => c.id)).toEqual([
      first.result.cards[1].id,
    ]);
    expect(after.result.cards).toHaveLength(1);
  });

  it("taking one does not open a third either", async () => {
    for (let i = 0; i < 5; i += 1) await seedIdea({ title: `Idea ${i}` });
    const first = await cards();
    await run("idea.take", { taskId: first.result.cards[0].id });
    const after = await cards();
    expect(after.result.cards).toHaveLength(1);
    expect(after.result.cards[0].id).toBe(first.result.cards[1].id);
  });

  it("the next day picks the 2 least recently shown, not yesterday's", async () => {
    for (let i = 0; i < 6; i += 1) await seedIdea({ title: `Idea ${i}` });
    const monday = (await cards()).result.cards.map((c) => c.id);
    setClock(new Date(NOW.getTime() + DAY));
    const tuesday = (await cards()).result.cards.map((c) => c.id);
    expect(tuesday).toHaveLength(2);
    for (const id of tuesday) expect(monday).not.toContain(id);
  });

  it("a snoozed idea is not chosen until the snooze ends", async () => {
    await seedIdea({
      title: "Snoozed",
      ideaSnoozedUntil: new Date(NOW.getTime() + 3 * DAY),
    });
    const none = await cards();
    expect(none.result.cards).toHaveLength(0);
    setClock(new Date(NOW.getTime() + 8 * DAY));
    const back = await cards();
    expect(back.result.cards.map((c) => c.title)).toEqual(["Snoozed"]);
  });

  it("an archived idea (3 skips) is never chosen", async () => {
    await seedIdea({ isArchived: true, ideaSkipCount: 3 });
    expect((await cards()).result.cards).toHaveLength(0);
  });

  it("none when the person has no ideas", async () => {
    await seedTask(db);
    const out = await cards();
    expect(out.result).toMatchObject({ cards: [], none: "no_ideas" });
  });

  it("none, and no stamp, when idea cards are off", async () => {
    jest.mocked(ideaCardsEnabled).mockResolvedValue(false);
    await seedIdea();
    const out = await cards();
    expect(out.result).toMatchObject({ cards: [], none: "off" });
    expect(db.tables.task.filter((r) => r.ideaLastShownAt)).toHaveLength(0);
    expect(recordActivation).not.toHaveBeenCalled();
    // the idea itself stays and can still be listed
    const listed = await run<{ ideas: unknown[] }>("idea.list", {});
    expect(listed.result.ideas).toHaveLength(1);
  });

  it("none on the evening review and the day plan", async () => {
    await seedIdea();
    for (const surface of ["review", "plan"]) {
      const out = await cards({ surface });
      expect(out.result).toMatchObject({ cards: [], none: "surface" });
    }
    expect(db.tables.task.filter((r) => r.ideaLastShownAt)).toHaveLength(0);
  });

  it("none for another day than the person's today", async () => {
    await seedIdea();
    const out = await cards({ day: "2026-11-22" });
    expect(out.result).toMatchObject({ cards: [], none: "other_day" });
  });

  it("uses the person's day, not UTC's", async () => {
    await seedIdea({ title: "Late" });
    // 23:30 UTC on Monday is already Tuesday in Zurich
    setClock(new Date("2026-11-23T23:30:00.000Z"));
    const out = await cards();
    expect(out.result.day).toBe("2026-11-24");
    expect(
      iso(db.tables.task.find((r) => r.title === "Late")?.ideaLastShownAt)
    ).toBe("2026-11-23T23:30:00.000Z");
    expect(TODAY_START).toBe("2026-11-22T23:00:00.000Z");
  });

  it("records idea_shown with a source and a position, never the title", async () => {
    await seedIdea({ title: "A private title", ideaSource: "converted" });
    await cards();
    const calls = jest.mocked(recordActivation).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("idea_shown");
    expect(calls[0][2]).toEqual({ source: "converted", position: 2 });
    expect(JSON.stringify(calls)).not.toContain("private");
    // a second read shows nothing new, so records nothing new
    await cards();
    expect(jest.mocked(recordActivation)).toHaveBeenCalledTimes(1);
  });

  it("reads only the person's own ideas", async () => {
    await seedIdea({ userId: "someone-else", assigneeId: "someone-else" });
    expect((await cards()).result.cards).toHaveLength(0);
  });
});

describe("events carry no title", () => {
  it("idea_taken and idea_skipped props are short kinds and counts", async () => {
    const idea = await seedIdea({ title: "Secret reading list" });
    await run("idea.skip", { taskId: idea.id });
    await run("idea.take", { taskId: idea.id });
    for (const call of jest.mocked(recordActivation).mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Secret");
      for (const value of Object.values(call[2] ?? {})) {
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });
});
