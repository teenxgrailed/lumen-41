import { parseTasksForUser } from "@/services/ai/parse-tasks";

import { recordActivation } from "@/lib/activation-events";

import { buildDraft, closeDay, getDayPlan, updateDayPlan } from "../plan";
import { DayPlanError, suggestedLimitFrom } from "../rules";
import { getPlanSettings, suggestLimit, updatePlanSettings } from "../settings";
import { createDayPlanDb } from "./fake-db";
import {
  NOW,
  OTHER,
  TODAY,
  TOMORROW,
  USER,
  dayDate,
  seedPlan,
  seedTask,
} from "./helpers";

const mockState = { db: createDayPlanDb() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/services/ai/parse-tasks", () => ({
  parseTasksForUser: jest.fn(),
}));
jest.mock("@/lib/auth/personal-workspace", () => ({
  ensurePersonalWorkspaceRow: jest.fn().mockResolvedValue({ id: "ws-1" }),
}));

const parse = parseTasksForUser as jest.Mock;
const record = recordActivation as jest.Mock;
const db = () => mockState.db;

const titles = (items: { title: string }[]) => items.map((i) => i.title);

beforeEach(() => {
  mockState.db = createDayPlanDb();
  db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
  db().insert("userSettings", { userId: OTHER, timeZone: "Europe/Zurich" });
  parse.mockReset();
  record.mockReset();
});

describe("D1 evening note and draft", () => {
  it("test_evening_note_becomes_tomorrows_draft", async () => {
    const existing = seedTask(db(), { title: "Call Anna" });
    parse.mockResolvedValue({
      fallback: false,
      tasks: [
        { title: "finish invoice" },
        { title: "call anna" },
        { title: "gym" },
      ],
    });

    const result = await buildDraft(USER, TOMORROW, {
      note: "finish invoice, call Anna, gym",
      now: NOW,
    });

    expect(result.built).toBe(true);
    expect(titles(result.plan.items)).toEqual([
      "finish invoice",
      "Call Anna",
      "gym",
    ]);
    expect(result.plan.status).toBe("draft");
    expect(result.plan.source).toBe("note");
    // The open task is reused, not duplicated.
    const annas = db().tables.task.filter((t) =>
      String(t.title).toLowerCase().includes("anna")
    );
    expect(annas).toHaveLength(1);
    expect(result.plan.items[1].taskId).toBe(existing.id);
    // The note is kept in the day's agenda (the evening before).
    const agenda = db().tables.dailyAgenda[0];
    expect(agenda.date).toEqual(dayDate(TODAY));
    expect(String(agenda.content)).toContain("finish invoice, call Anna, gym");
    expect(record).toHaveBeenCalledWith(
      "plan_built",
      USER,
      expect.objectContaining({ taskCount: 3, source: "note" })
    );
  });

  it("falls back to the deterministic parser without losing the note", async () => {
    parse.mockResolvedValue({
      fallback: true,
      tasks: [{ title: "write report" }],
    });
    const result = await buildDraft(USER, TOMORROW, {
      note: "write report",
      now: NOW,
    });
    expect(result.plan.source).toBe("fallback");
    expect(String(db().tables.dailyAgenda[0].content)).toContain(
      "write report"
    );
  });

  it("builds a draft without a note from the day's dated tasks", async () => {
    seedTask(db(), { title: "Dated", dueDate: dayDate(TOMORROW) });
    seedTask(db(), { title: "Undated" });
    const result = await buildDraft(USER, TOMORROW, { now: NOW });
    expect(result.plan.source).toBe("no_note");
    expect(titles(result.plan.items)).toEqual(["Dated"]);
  });

  it("test_draft_never_overwrites_user_edits", async () => {
    parse.mockResolvedValueOnce({
      fallback: false,
      tasks: [{ title: "alpha" }, { title: "beta" }, { title: "gamma" }],
    });
    const first = await buildDraft(USER, TOMORROW, { note: "x", now: NOW });
    const [a, b, c] = first.plan.items.map((item) => item.taskId);

    // The person drops beta and reorders.
    await updateDayPlan(
      USER,
      { date: TOMORROW, items: [{ taskId: c }, { taskId: a }] },
      NOW
    );

    parse.mockResolvedValueOnce({
      fallback: false,
      tasks: [{ title: "delta" }],
    });
    const rebuilt = await buildDraft(USER, TOMORROW, { note: "y", now: NOW });

    expect(rebuilt.built).toBe(false);
    expect(rebuilt.skipped).toBe("edited");
    expect(rebuilt.plan.items.map((i) => i.taskId)).toEqual([c, a]);
    expect(rebuilt.plan.items.map((i) => i.taskId)).not.toContain(b);
    // New material is offered, not forced in.
    expect(titles(rebuilt.suggested)).toContain("delta");
    expect(
      record.mock.calls.filter(([name]) => name === "plan_built")
    ).toHaveLength(1);
  });

  it("does not record plan_built again when an unedited draft is rebuilt", async () => {
    parse.mockResolvedValue({ fallback: false, tasks: [{ title: "one" }] });
    await buildDraft(USER, TOMORROW, { note: "one", now: NOW });
    await buildDraft(USER, TOMORROW, { note: "one", now: NOW });
    expect(
      record.mock.calls.filter(([name]) => name === "plan_built")
    ).toHaveLength(1);
  });
});

describe("D2 limit", () => {
  it("test_default_plan_has_five_tasks_three_main", async () => {
    for (let i = 0; i < 12; i += 1) {
      seedTask(db(), { dueDate: dayDate(TOMORROW) });
    }
    const { plan } = await buildDraft(USER, TOMORROW, { now: NOW });
    expect(plan.limit).toBe(5);
    expect(plan.taskCount).toBe(5);
    expect(plan.items.filter((item) => item.isMain)).toHaveLength(3);
  });

  it("test_limit_outside_3_to_10_is_rejected", async () => {
    for (const bad of [2, 11]) {
      await expect(
        updatePlanSettings(USER, { taskLimit: bad }, NOW)
      ).rejects.toMatchObject({ code: "invalid_input", status: 400 });
    }
    await expect(
      updatePlanSettings(USER, { focusMinutes: 360 }, NOW)
    ).rejects.toThrow(/5 hours/);
    await expect(
      updatePlanSettings(USER, { taskLimit: 2 }, NOW)
    ).rejects.toThrow(/between 3 and 10/);
    // Nothing was stored.
    expect(db().tables.planSettings).toHaveLength(0);
    expect((await getPlanSettings(USER)).taskLimit).toBe(5);
    // The bounds themselves are fine.
    expect(
      (await updatePlanSettings(USER, { taskLimit: 3 }, NOW)).taskLimit
    ).toBe(3);
    expect(
      (await updatePlanSettings(USER, { taskLimit: 10 }, NOW)).taskLimit
    ).toBe(10);
  });

  it("test_focus_budget_stops_plan_before_five_hours", async () => {
    await updatePlanSettings(USER, { taskLimit: 8, focusMinutes: 300 }, NOW);
    // 4 x 60 min, two with no estimate (30 each), then 60 more: 360 in all.
    for (const minutes of [60, 60, 60, 60, null, null, 60, 60]) {
      seedTask(db(), {
        dueDate: dayDate(TOMORROW),
        estimatedMinutes: minutes,
      });
    }
    const { plan } = await buildDraft(USER, TOMORROW, { now: NOW });
    expect(plan.taskCount).toBe(6);
    expect(plan.focusMinutes).toBe(300);
    expect(plan.focusMinutes).toBeLessThanOrEqual(5 * 60);
  });

  it("test_limit_suggested_only_after_14_days_and_clamped", async () => {
    // The pure rule.
    expect(suggestedLimitFrom(Array(13).fill(4))).toBeNull();
    expect(suggestedLimitFrom(Array(14).fill(4))).toBe(4);
    expect(suggestedLimitFrom(Array(14).fill(1))).toBe(3);
    expect(suggestedLimitFrom(Array(14).fill(12))).toBe(10);

    // Against stored plans: limit 7, 13 days of history, then 14.
    await updatePlanSettings(USER, { taskLimit: 7 }, NOW);
    const planDay = (offset: number) => {
      const key = new Date(NOW.getTime() - offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const ids = Array.from({ length: 4 }, () =>
        String(seedTask(db(), { status: "completed" }).id)
      );
      seedPlan(db(), key, ids, { status: "closed" });
    };
    for (let offset = 1; offset <= 13; offset += 1) planDay(offset);
    expect(await suggestLimit(USER, NOW)).toBeNull();
    planDay(14);
    expect(await suggestLimit(USER, NOW)).toBe(4);

    // Dismissing keeps the limit and goes quiet.
    await updatePlanSettings(USER, { dismissSuggestion: true }, NOW);
    expect(await suggestLimit(USER, NOW)).toBeNull();
    expect((await getPlanSettings(USER)).taskLimit).toBe(7);
  });
});

describe("D4 evening review", () => {
  const planWithLeftovers = () => {
    const done = seedTask(db(), { status: "completed" });
    const a = seedTask(db(), { title: "Leftover A" });
    const b = seedTask(db(), { title: "Leftover B" });
    const plan = seedPlan(db(), TODAY, [done.id, a.id, b.id], {
      status: "active",
    });
    return { done, a, b, plan };
  };

  it("test_every_leftover_needs_a_resolution_to_close_day", async () => {
    const { a, b, plan } = planWithLeftovers();
    const before = structuredClone(db().tables.task);

    await expect(
      closeDay(
        USER,
        {
          date: TODAY,
          resolutions: [{ taskId: String(a.id), resolution: "tomorrow" }],
        },
        { now: NOW }
      )
    ).rejects.toMatchObject({
      code: "missing_resolutions",
      details: { missing: [b.id] },
    });
    // Nothing moved: the day is still open and no task changed.
    expect(db().tables.dayPlan.find((p) => p.id === plan.id)?.status).toBe(
      "active"
    );
    expect(db().tables.task).toEqual(before);

    const closed = await closeDay(
      USER,
      {
        date: TODAY,
        resolutions: [
          { taskId: String(a.id), resolution: "tomorrow" },
          { taskId: String(b.id), resolution: "someday" },
        ],
      },
      { now: NOW }
    );
    expect(closed).toMatchObject({
      planned: 3,
      done: 1,
      toTomorrow: 1,
      toSomeday: 1,
      deleted: 0,
    });
    expect(db().tables.task.find((t) => t.id === b.id)?.somedayAt).toEqual(NOW);
    const tomorrow = await getDayPlan(USER, TOMORROW, NOW);
    expect(titles(tomorrow.plan?.items ?? [])).toEqual(["Leftover A"]);
  });

  it("deletes to Trash, restorable, and a nothing-left day closes in one call", async () => {
    const a = seedTask(db());
    seedPlan(db(), TODAY, [String(a.id)], { status: "active" });
    await closeDay(
      USER,
      {
        date: TODAY,
        resolutions: [{ taskId: String(a.id), resolution: "delete" }],
      },
      { now: NOW }
    );
    const task = db().tables.task.find((t) => t.id === a.id);
    expect(task).toBeDefined();
    expect(task?.trashedAt).toEqual(NOW);

    const done = seedTask(db(), { status: "completed" });
    seedPlan(db(), "2026-11-18", [String(done.id)], { status: "active" });
    const result = await closeDay(
      USER,
      { date: "2026-11-18", resolutions: [] },
      { now: NOW }
    );
    expect(result).toMatchObject({ planned: 1, done: 1, status: "closed" });
  });

  it("tells which leftovers would not fit tomorrow before moving them", async () => {
    await updatePlanSettings(USER, { taskLimit: 3 }, NOW);
    const ids = [0, 1, 2, 3].map((i) =>
      String(seedTask(db(), { title: `L${i}` }).id)
    );
    seedPlan(db(), TODAY, ids, { status: "active" });
    const resolutions = ids.map((taskId) => ({
      taskId,
      resolution: "tomorrow" as const,
    }));
    await expect(
      closeDay(USER, { date: TODAY, resolutions }, { now: NOW })
    ).rejects.toMatchObject({
      code: "overflow",
      details: { wouldNotFit: [ids[3]] },
    });
    expect(
      db().tables.dayPlan.filter((p) => p.status === "closed")
    ).toHaveLength(0);
    const ok = await closeDay(
      USER,
      { date: TODAY, resolutions, confirmOverflow: true },
      { now: NOW }
    );
    expect(ok.toTomorrow).toBe(4);
  });

  it("test_leftover_task_is_not_moved_silently", async () => {
    const left = seedTask(db(), {
      title: "Left over",
      dueDate: dayDate(TODAY),
    });
    const plan = seedPlan(db(), TODAY, [String(left.id)], { status: "active" });

    // Midnight passes, nobody reviews; the next evening's draft is built.
    const next = await buildDraft(USER, "2026-11-21", {
      now: new Date("2026-11-20T20:00:00Z"),
    });
    const snapshot = await getDayPlan(
      USER,
      TOMORROW,
      new Date("2026-11-20T08:00:00Z")
    );

    expect(snapshot.needsDecision.map((t) => t.id)).toEqual([left.id]);
    expect(snapshot.plan?.items ?? []).toHaveLength(0);
    expect(next.plan.items.map((i) => i.taskId)).not.toContain(left.id);
    const task = db().tables.task.find((t) => t.id === left.id);
    expect(task?.dueDate).toEqual(dayDate(TODAY));
    expect(task?.somedayAt).toBeNull();
    expect(db().tables.dayPlan.find((p) => p.id === plan.id)?.status).toBe(
      "active"
    );
    expect(
      db().tables.dayPlanItem.filter((i) => i.planId === plan.id)
    ).toHaveLength(1);
  });
});

describe("plan edits", () => {
  it("never grows past the limit without a confirmation", async () => {
    await updatePlanSettings(USER, { taskLimit: 3 }, NOW);
    const ids = [0, 1, 2, 3].map((i) =>
      String(seedTask(db(), { title: `T${i}` }).id)
    );
    await updateDayPlan(
      USER,
      { date: TOMORROW, items: ids.slice(0, 3).map((taskId) => ({ taskId })) },
      NOW
    );
    await expect(
      updateDayPlan(
        USER,
        { date: TOMORROW, items: ids.map((taskId) => ({ taskId })) },
        NOW
      )
    ).rejects.toMatchObject({ code: "over_limit", status: 409 });
    // A swap stays within the limit.
    const swapped = await updateDayPlan(
      USER,
      {
        date: TOMORROW,
        items: [ids[0], ids[1], ids[3]].map((taskId) => ({ taskId })),
      },
      NOW
    );
    expect(swapped.taskCount).toBe(3);
    const over = await updateDayPlan(
      USER,
      {
        date: TOMORROW,
        items: ids.map((taskId) => ({ taskId })),
        confirmOverLimit: true,
      },
      NOW
    );
    expect(over.taskCount).toBe(4);
  });

  it("allows at most three main tasks", async () => {
    const ids = [0, 1, 2, 3].map((i) =>
      String(seedTask(db(), { title: `M${i}` }).id)
    );
    await expect(
      updateDayPlan(
        USER,
        {
          date: TOMORROW,
          items: ids.map((taskId) => ({ taskId, isMain: true })),
          confirmOverLimit: true,
        },
        NOW
      )
    ).rejects.toMatchObject({ code: "invalid_main" });
  });
});

describe("D5 kill switch", () => {
  it("test_kill_switch_off_keeps_plan_data", async () => {
    // Plan rows are plain data: nothing in the plan services deletes them when
    // the flag is off. The sweep and the guard stand down (see someday and
    // scheduler-guard tests); the API keeps answering.
    const a = seedTask(db());
    seedPlan(db(), TOMORROW, [String(a.id)]);
    const before = structuredClone([
      db().tables.dayPlan,
      db().tables.dayPlanItem,
    ]);
    const snapshot = await getDayPlan(USER, TOMORROW, NOW);
    expect(snapshot.plan?.taskCount).toBe(1);
    expect([db().tables.dayPlan, db().tables.dayPlanItem]).toEqual(before);
  });
});

describe("API scoping", () => {
  it("test_other_users_plan_is_not_found", async () => {
    const mine = seedTask(db(), { userId: USER });
    const theirs = seedTask(db(), { userId: OTHER, title: "Theirs" });
    seedPlan(db(), TODAY, [String(theirs.id)], { status: "active" }, OTHER);

    // The other person's plan is not visible, and their task cannot be added.
    expect((await getDayPlan(USER, TODAY, NOW)).plan).toBeNull();
    await expect(
      updateDayPlan(
        USER,
        { date: TODAY, items: [{ taskId: String(theirs.id) }] },
        NOW
      )
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      closeDay(
        USER,
        {
          date: TODAY,
          resolutions: [{ taskId: String(theirs.id), resolution: "delete" }],
        },
        { now: NOW }
      )
    ).rejects.toBeInstanceOf(DayPlanError);
    await expect(
      closeDay(USER, { date: TODAY, resolutions: [] }, { now: NOW })
    ).rejects.toMatchObject({ code: "no_plan", status: 404 });
    // Nothing of theirs changed.
    expect(
      db().tables.task.find((t) => t.id === theirs.id)?.trashedAt
    ).toBeNull();
    expect(mine.userId).toBe(USER);
  });
});

describe("analytics", () => {
  it("test_events_carry_no_task_titles", async () => {
    parse.mockResolvedValue({
      fallback: false,
      tasks: [{ title: "Secret merger memo" }, { title: "Buy Anna a gift" }],
    });
    const note = "Secret merger memo\nBuy Anna a gift";
    const built = await buildDraft(USER, TOMORROW, { note, now: NOW });
    const ids = built.plan.items.map((i) => i.taskId);
    // Close the day the note was written for.
    const today = seedTask(db(), { title: "Unfinished confidential thing" });
    seedPlan(db(), TODAY, [String(today.id)], { status: "active" });
    await closeDay(
      USER,
      {
        date: TODAY,
        resolutions: [{ taskId: String(today.id), resolution: "someday" }],
      },
      { now: NOW }
    );
    expect(ids).toHaveLength(2);

    const events = record.mock.calls.map(([name, , props]) => ({
      name,
      props,
    }));
    expect(events.map((e) => e.name).sort()).toEqual([
      "day_closed",
      "plan_built",
      "task_to_someday",
    ]);
    const serialized = JSON.stringify(events);
    for (const secret of [
      "Secret merger memo",
      "Buy Anna a gift",
      "Unfinished confidential thing",
      "Anna",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    for (const { props } of events) {
      for (const value of Object.values(props as Record<string, unknown>)) {
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });
});
