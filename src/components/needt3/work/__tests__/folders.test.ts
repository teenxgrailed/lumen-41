import type { V3Task } from "@/lib/needt3/map";

import { nextTasks, peekMeta, projectStats } from "../model";

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

  it("counts the same open tasks the folder shows as its count", () => {
    const tasks = [
      t("a", { dueDate: TODAY }),
      t("b"),
      t("c", { done: true }),
      t("d"),
      t("e"),
    ];
    expect(projectStats("p1", tasks, TODAY).open).toBe(4);
    expect(nextTasks("p1", tasks, TODAY, 10)).toHaveLength(4);
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
