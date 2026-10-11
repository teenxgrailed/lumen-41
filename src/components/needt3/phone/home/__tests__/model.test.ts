import type { V3Task } from "@/lib/needt3/map";

import { homeView, nextUpWhy, taskHits } from "../model";

const TODAY = "2026-09-02";
const task = (id: string, o: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    done: false,
    noSlot: false,
    isFixed: false,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: null,
    trashedAt: null,
    projectId: null,
    ...o,
  }) as unknown as V3Task;

describe("homeView", () => {
  const tasks = [
    task("late", { dueDate: "2026-09-01", scheduledStart: "2026-09-01T10:00" }),
    task("am", { scheduledStart: "2026-09-02T09:00", estimatedMinutes: 30 }),
    task("pm", { scheduledStart: "2026-09-02T14:00" }),
    task("anytime"),
    task("inbox", { dueDate: null }),
    task("tom", { dueDate: "2026-09-03" }),
    task("doneNow", { done: true }),
    task("doneOld", { done: true, dueDate: null }),
    task("trashed", { trashedAt: "2026-09-01T00:00" }),
  ];

  it("splits the day and puts the overdue task on the plate first", () => {
    const v = homeView(tasks, TODAY);
    expect(v.next.nu?.id).toBe("late");
    expect(v.lateRows).toEqual([]); // the plate's own task is not a row too
    expect(v.parts.map(([p, l]) => [p, l.map((t) => t.id)])).toEqual([
      ["Morning", ["am"]],
      ["Afternoon", ["pm"]],
      ["Anytime", ["anytime"]],
    ]);
    expect(v.inboxRows.map((t) => t.id)).toEqual(["inbox"]);
    expect(v.tomorrowRows.map((t) => t.id)).toEqual(["tom"]);
    expect(v.lateN).toBe(1);
  });

  it("Done today holds today's closed tasks only", () => {
    const v = homeView(tasks, TODAY);
    expect(v.doneToday.map((t) => t.id)).toEqual(["doneNow"]);
    expect([v.done, v.total]).toEqual([1, 4]);
  });

  it("a trashed task is nowhere", () => {
    const v = homeView(tasks, TODAY);
    const ids = [
      ...v.lateRows,
      ...v.parts.flatMap(([, l]) => l),
      ...v.inboxRows,
      ...v.tomorrowRows,
      ...v.doneToday,
    ].map((t) => t.id);
    expect(ids).not.toContain("trashed");
  });

  it("a row that is leaving gives the plate to the next one", () => {
    const v = homeView(tasks, TODAY, { busy: { late: "check" } });
    expect(v.next.nu?.id).toBe("am");
    // am is on the plate, so not a row too, and its empty part is dropped
    expect(v.parts.map(([p]) => p)).toEqual(["Afternoon", "Anytime"]);
  });

  it("Skip passes over the plate's task", () => {
    const a = homeView(tasks, TODAY);
    const b = homeView(tasks, TODAY, { skipped: a.next.skip([]) });
    expect(b.next.nu?.id).toBe("am");
  });

  it("a finished day is one line; a clear one is empty", () => {
    const closed = homeView(
      [task("a", { done: true }), task("b", { done: true })],
      TODAY
    );
    expect(closed.dayClosed).toBe(true);
    expect(closed.allDone).toBe(true);
    expect(closed.empty).toBe(false);
    const clear = homeView([], TODAY);
    expect(clear.empty).toBe(true);
    expect(clear.allDone).toBe(false);
    expect(clear.next.nu).toBeNull();
  });
});

describe("nextUpWhy", () => {
  it("overdue: since when, and how many more", () => {
    const a = task("a", { dueDate: "2026-09-01" });
    const b = task("b", { dueDate: "2026-08-30" });
    const v = homeView([a, b], TODAY);
    expect(nextUpWhy(v.next)).toBe("Overdue since 30 Aug · +1 overdue");
    expect(nextUpWhy(homeView([a], TODAY).next)).toBe("Overdue since 1 Sep");
  });
  it("fits before the next timed task, else due today", () => {
    const fits = homeView(
      [
        task("a", { scheduledStart: "2026-09-02T09:00", estimatedMinutes: 60 }),
        task("b", { scheduledStart: "2026-09-02T11:00" }),
      ],
      TODAY
    );
    expect(nextUpWhy(fits.next)).toBe("Fits before 11:00");
    const tight = homeView(
      [
        task("a", {
          scheduledStart: "2026-09-02T09:00",
          estimatedMinutes: 150,
        }),
        task("b", { scheduledStart: "2026-09-02T11:00" }),
      ],
      TODAY
    );
    expect(nextUpWhy(tight.next)).toBe("Due today");
    expect(nextUpWhy(homeView([], TODAY).next)).toBe("");
  });
});

describe("taskHits", () => {
  const list = [
    task("a", { title: "Call Anna", scheduledStart: "2026-09-02T15:30" }),
    task("b", { title: "call the bank", dueDate: "2026-09-01" }),
    task("c", { title: "Call plumber", done: true }),
    task("d", { title: "Call dentist", dueDate: null }),
    task("e", { title: "Write call notes", dueDate: "2026-09-10" }),
    task("f", { title: "Call mum" }),
    task("g", { title: "Gym", trashedAt: "x" }),
  ];
  it("matches words in titles, five at most, with where each sits", () => {
    const hits = taskHits(list, " CALL ", TODAY);
    expect(hits).toHaveLength(5);
    expect(hits.map((h) => h.meta)).toEqual([
      "2 Sep · 15:30",
      "Overdue",
      "Done",
      "Inbox",
      "10 Sep",
    ]);
  });
  it("nothing for an empty query or a trashed task", () => {
    expect(taskHits(list, "  ", TODAY)).toEqual([]);
    expect(taskHits(list, "gym", TODAY)).toEqual([]);
  });
});
