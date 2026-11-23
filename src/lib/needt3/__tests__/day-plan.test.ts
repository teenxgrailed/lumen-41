import {
  type DayPlanSnapshot,
  type PlanItemView,
  type PlanView,
  closeBody,
  isOverflow,
  isPlanOff,
  leftoversOf,
  planIsShown,
  planLine,
  planPickIds,
  planSections,
  tomorrowPreview,
} from "../day-plan";

const item = (id: string, o: Partial<PlanItemView> = {}): PlanItemView => ({
  taskId: id,
  title: `Task ${id}`,
  status: "todo",
  isMain: false,
  position: 0,
  addedBy: "draft",
  resolution: null,
  estimatedMinutes: 30,
  dueDate: null,
  ...o,
});

const plan = (items: PlanItemView[], o: Partial<PlanView> = {}): PlanView => ({
  date: "2026-11-19",
  status: "active",
  source: "no_note",
  builtAt: "2026-11-19T06:00:00.000Z",
  closedAt: null,
  edited: false,
  limit: 5,
  mainLimit: 3,
  focusBudgetMinutes: 240,
  focusMinutes: items.reduce((n, i) => n + i.estimatedMinutes, 0),
  taskCount: items.length,
  mainCount: items.filter((i) => i.isMain).length,
  items,
  ...o,
});

const snap = (p: PlanView | null, needs = 0): DayPlanSnapshot => ({
  date: "2026-11-19",
  plan: p,
  settings: { taskLimit: 5 } as DayPlanSnapshot["settings"],
  needsDecision: Array.from({ length: needs }, (_, i) => ({
    id: `old${i}`,
    title: `Old ${i}`,
    estimatedMinutes: 20,
    dueDate: null,
  })),
  limitSuggestion: null,
});

describe("what Today shows of a plan", () => {
  it("puts the main tasks on top and the rest below, in plan order", () => {
    const s = planSections(
      snap(
        plan([
          item("a", { isMain: true }),
          item("b"),
          item("c", { isMain: true }),
        ])
      )
    );
    expect(s.main.map((i) => i.taskId)).toEqual(["a", "c"]);
    expect(s.rest.map((i) => i.taskId)).toEqual(["b"]);
  });

  it("keeps the earlier leftovers in their own group, not in the plan", () => {
    const s = planSections(snap(plan([item("a")]), 58));
    expect(s.needsDecision).toHaveLength(58);
    expect(s.main.length + s.rest.length).toBe(1);
  });

  it("draws the plan only when it has tasks, so an empty draft leaves Today as it was", () => {
    expect(planIsShown(snap(null))).toBe(false);
    expect(planIsShown(snap(plan([])))).toBe(false);
    expect(planIsShown(snap(plan([item("a")])))).toBe(true);
  });

  it("says the limit and the focus total in one quiet line", () => {
    const line = planLine(plan([item("a"), item("b")], { focusMinutes: 130 }));
    expect(line).toBe("2 of 5 tasks · 2 h 10 min of 4 h focus");
  });
});

describe("planPickIds: which picks still count for today", () => {
  it("keeps open and done picks, drops those the close sent away", () => {
    const ids = planPickIds(
      snap(
        plan([
          item("open"),
          item("done", { status: "completed" }),
          item("resolvedDone", { resolution: "done" }),
          item("tomorrow", { resolution: "tomorrow" }),
          item("later", { resolution: "someday" }),
          item("gone", { resolution: "deleted" }),
        ])
      )
    );
    expect([...ids].sort()).toEqual(["done", "open", "resolvedDone"]);
  });

  it("is empty with no plan", () => {
    expect(planPickIds(undefined).size).toBe(0);
    expect(planPickIds(snap(null)).size).toBe(0);
  });
});

describe("closing the day", () => {
  it("lists only open planned tasks as leftovers", () => {
    const p = plan([
      item("a"),
      item("b", { status: "completed" }),
      item("c", { resolution: "done" }),
      item("d", { resolution: "deleted" }),
    ]);
    expect(leftoversOf(p).map((i) => i.taskId)).toEqual(["a"]);
  });

  it("has no leftovers once the day is closed", () => {
    expect(leftoversOf(plan([item("a")], { status: "closed" }))).toEqual([]);
  });

  it("gives every leftover exactly one resolution, tomorrow when none was picked", () => {
    const body = closeBody(
      "2026-11-19",
      [{ taskId: "a" }, { taskId: "b" }, { taskId: "c" }],
      { b: "someday", c: "delete" }
    );
    expect(body.resolutions).toEqual([
      { taskId: "a", resolution: "tomorrow" },
      { taskId: "b", resolution: "someday" },
      { taskId: "c", resolution: "delete" },
    ]);
    expect(body).not.toHaveProperty("confirmOverflow");
  });

  it("asks for the overflow confirmation only after the person agreed", () => {
    expect(closeBody("2026-11-19", [], {}, true).confirmOverflow).toBe(true);
  });
});

describe("tomorrow's preview", () => {
  const left = [
    { taskId: "a", title: "A" },
    { taskId: "b", title: "B" },
  ];

  it("closing the day with a leftover sent to tomorrow puts it in tomorrow's plan", () => {
    const p = tomorrowPreview(
      plan([item("x", { title: "X" })]),
      left,
      { a: "tomorrow", b: "someday" },
      5
    );
    expect(p.titles).toEqual(["X", "A"]);
    expect(p.over).toBe(false);
  });

  it("does not repeat a task that is already in tomorrow's plan", () => {
    const p = tomorrowPreview(plan([item("a", { title: "A" })]), left, {}, 5);
    expect(p.titles).toEqual(["A", "B"]);
  });

  it("flags more than the limit so the close asks first", () => {
    const p = tomorrowPreview(null, left, {}, 1);
    expect(p.count).toBe(2);
    expect(p.over).toBe(true);
  });
});

describe("what the server's refusals mean", () => {
  it("reads the kill switch as 404 disabled", () => {
    expect(isPlanOff({ status: 404, message: "disabled" })).toBe(true);
    expect(isPlanOff({ status: 404, message: "no_plan" })).toBe(false);
    expect(isPlanOff(new Error("x"))).toBe(false);
  });

  it("reads 409 overflow as a question, not a failure", () => {
    expect(isOverflow({ status: 409, message: "overflow" })).toBe(true);
    expect(isOverflow({ status: 500, message: "overflow" })).toBe(false);
  });
});
