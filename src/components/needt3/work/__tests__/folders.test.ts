import type { V3Task } from "@/lib/needt3/map";

import { folderOpen, nextTasks, peekMeta } from "../model";

const base: V3Task = {
  id: "t",
  title: "Task",
  notes: null,
  done: false,
  status: "todo",
  projectId: "p1",
  dueDate: null,
  estimatedMinutes: null,
  scheduledStart: null,
  scheduledEnd: null,
  isFixed: false,
  auto: false,
  noSlot: false,
  entry: null,
  chunk: null,
  splitAllowed: true,
  deadline: null,
  hardDeadline: false,
  priority: "medium",
  holder: null,
  blockedBy: null,
  value: null,
  earned: null,
  Stage: null,
  movedFrom: null,
  trashedAt: null,
  source: null,
  repeat: null,
  scheduleId: null,
  labels: [],
  attachments: [],
  syncedFrom: null,
  createdAt: null,
  updatedAt: null,
  parts: [],
  waits: [],
};
const t = (id: string, patch: Partial<V3Task> = {}): V3Task => ({
  ...base,
  id,
  title: id,
  ...patch,
});
const TODAY = "2026-11-15";

describe("nextTasks (the sheets in a project folder)", () => {
  it("lists the soonest open tasks first, at most three", () => {
    const tasks = [
      t("later", { dueDate: "2026-11-30" }),
      t("nodate"),
      t("tomorrow", { dueDate: "2026-11-16" }),
      t("overdue", { dueDate: "2026-11-10" }),
      t("today", { dueDate: TODAY }),
    ];
    expect(nextTasks("p1", tasks, TODAY).map((x) => x.id)).toEqual([
      "overdue",
      "today",
      "tomorrow",
    ]);
  });

  it("puts a placed task by its block and an undated one last", () => {
    const tasks = [
      t("none"),
      t("late-slot", { scheduledStart: "2026-11-17T15:00" }),
      t("early-slot", { scheduledStart: "2026-11-17T09:00" }),
    ];
    expect(nextTasks("p1", tasks, TODAY).map((x) => x.id)).toEqual([
      "early-slot",
      "late-slot",
      "none",
    ]);
  });

  it("skips done, no-slot and other projects' tasks", () => {
    const tasks = [
      t("done", { done: true, dueDate: TODAY }),
      t("noslot", { noSlot: true, dueDate: TODAY }),
      t("other", { projectId: "p2", dueDate: TODAY }),
      t("mine", { dueDate: "2026-11-20" }),
    ];
    expect(nextTasks("p1", tasks, TODAY).map((x) => x.id)).toEqual(["mine"]);
    expect(nextTasks("p3", tasks, TODAY)).toEqual([]);
  });

  it("counts what it shows: no-slot and trashed tasks are in neither", () => {
    const tasks = [
      t("a", { dueDate: TODAY }),
      t("b"),
      t("c", { done: true }),
      t("noslot", { noSlot: true }),
      t("trashed", { trashedAt: "2026-11-01T10:00:00Z" }),
      t("d"),
      t("e"),
    ];
    expect(folderOpen("p1", tasks).map((x) => x.id)).toEqual([
      "a",
      "b",
      "d",
      "e",
    ]);
    const shown = nextTasks("p1", tasks, TODAY, 10).map((x) => x.id);
    expect(shown).toHaveLength(4);
    expect(shown).not.toContain("noslot");
    expect(shown).not.toContain("trashed");
  });

  it("breaks a same-day tie by the hour on that day, then title", () => {
    const tasks = [
      t("b-late", { dueDate: TODAY, scheduledStart: "2026-11-15T16:00" }),
      t("a-early", { dueDate: TODAY, scheduledStart: "2026-11-15T08:00" }),
      t("c-anytime", { dueDate: TODAY }),
    ];
    expect(nextTasks("p1", tasks, TODAY).map((x) => x.id)).toEqual([
      "a-early",
      "b-late",
      "c-anytime",
    ]);
  });
});

describe("peekMeta", () => {
  it("names the day: Today, Overdue, a date, or nothing", () => {
    expect(peekMeta(t("a", { dueDate: TODAY }), TODAY)).toBe("Today");
    expect(peekMeta(t("b", { dueDate: "2026-11-01" }), TODAY)).toBe("Overdue");
    expect(peekMeta(t("c", { dueDate: "2026-12-04" }), TODAY)).toBe("4 Dec");
    expect(peekMeta(t("d"), TODAY)).toBeUndefined();
  });
});
