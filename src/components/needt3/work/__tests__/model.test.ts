import type { V3Project, V3Task } from "@/lib/needt3/map";

import {
  NO_PROJECT,
  cardLine,
  cardTasks,
  nameTaken,
  openLine,
  projectGroups,
  projectStats,
  projectsSorted,
  readProjectSort,
  upcomingTitle,
  wkMins,
  workModel,
} from "../model";

const base: V3Task = {
  id: "t",
  title: "Task",
  notes: null,
  done: false,
  status: "todo",
  projectId: null,
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
const p = (id: string, name: string, position = 0): V3Project => ({
  id,
  name,
  color: null,
  icon: null,
  ground: null,
  position,
  archived: false,
});

// The prototype's fixed week: Tuesday 1 Sep 2026 is today.
const TODAY = "2026-09-01";
const projects = [p("ops", "Operations"), p("ds", "Design")];
const tasks = [
  t("inbox"),
  t("inbox-done", { done: true }),
  t("late", { dueDate: "2026-08-30", projectId: "ops" }),
  t("today-9", {
    dueDate: TODAY,
    scheduledStart: `${TODAY}T09:00`,
    projectId: "ops",
  }),
  t("today-8", { dueDate: TODAY, scheduledStart: `${TODAY}T08:00` }),
  t("today-done", { dueDate: TODAY, done: true, projectId: "ds" }),
  t("tomorrow", { dueDate: "2026-09-02", projectId: "ds" }),
  t("far", { dueDate: "2026-09-20", projectId: "ds" }),
  t("fixed-nodate", { isFixed: true }),
  t("noslot", { noSlot: true }),
  t("trashed", { trashedAt: "2026-08-31T10:00:00.000Z" }),
];

const ids = (l: readonly V3Task[]) => l.map((x) => x.id);

describe("workModel", () => {
  it("Inbox holds undated, unfixed open tasks; Done the closed ones", () => {
    const m = workModel({ tasks, projects, today: TODAY, tab: "inbox" });
    expect(m.sections.map((s) => s.key)).toEqual(["inbox"]);
    expect(ids(m.sections[0].tasks)).toEqual(["inbox"]);
    expect(ids(m.done)).toEqual(["inbox-done"]);
  });

  it("Today splits Overdue from Today, sorted by hour", () => {
    const m = workModel({ tasks, projects, today: TODAY, tab: "today" });
    expect(m.sections.map((s) => [s.key, ids(s.tasks)])).toEqual([
      ["overdue", ["late"]],
      ["today", ["today-8", "today-9"]],
    ]);
    expect(m.sections[0].tone).toBe("late");
    expect(ids(m.done)).toEqual(["today-done"]);
    expect(m.counts.today).toBe(3);
  });

  it("Upcoming is one section per day for the next six days", () => {
    const m = workModel({ tasks, projects, today: TODAY, tab: "upcoming" });
    expect(m.sections.map((s) => s.title)).toEqual(["Tomorrow, 2 Sep"]);
    expect(m.counts.upcoming).toBe(1);
  });

  it("All lists Inbox, each project, then dated tasks with no project", () => {
    const m = workModel({ tasks, projects, today: TODAY, tab: "all" });
    expect(m.sections.map((s) => s.title)).toEqual([
      "Inbox",
      "Operations",
      "Design",
      "No project",
    ]);
    expect(ids(m.sections[3].tasks)).toEqual(["today-8"]);
  });

  it("never shows trashed or no-slot tasks", () => {
    const m = workModel({ tasks, projects, today: TODAY, tab: "all" });
    const all = m.sections.flatMap((s) => ids(s.tasks)).concat(ids(m.done));
    expect(all).not.toContain("trashed");
    expect(all).not.toContain("noslot");
  });

  it("filters by project, and by No project", () => {
    const ops = workModel({
      tasks,
      projects,
      today: TODAY,
      tab: "all",
      filter: "ops",
    });
    expect(ops.filter).toBe("ops");
    expect(ops.sections.flatMap((s) => ids(s.tasks))).toEqual([
      "today-9",
      "late",
    ]);
    const none = workModel({
      tasks,
      projects,
      today: TODAY,
      tab: "inbox",
      filter: NO_PROJECT,
    });
    expect(ids(none.sections[0].tasks)).toEqual(["inbox"]);
  });

  it("drops a filter whose project is gone", () => {
    const m = workModel({
      tasks,
      projects,
      today: TODAY,
      tab: "all",
      filter: "gone",
    });
    expect(m.filter).toBeNull();
  });

  it("Projects → List has no Inbox and only project tasks in Done", () => {
    const m = workModel({
      tasks,
      projects,
      today: TODAY,
      tab: "all",
      projectsOnly: true,
    });
    expect(m.sections[0].title).toBe("Operations");
    expect(ids(m.done)).toEqual(["today-done"]);
  });
});

describe("projects", () => {
  it("sorts manual, by name and by open count", () => {
    const list = [p("a", "Zeta"), p("b", "Alpha")];
    const open = [t("1", { projectId: "b" }), t("2", { projectId: "b" })];
    expect(ids(projectsSorted(list, "manual") as never)).toEqual(["a", "b"]);
    expect(ids(projectsSorted(list, "name") as never)).toEqual(["b", "a"]);
    expect(ids(projectsSorted(list, "open", open) as never)).toEqual([
      "b",
      "a",
    ]);
    expect(readProjectSort("open")).toBe("open");
    expect(readProjectSort(42)).toBe("manual");
  });

  it("counts a project's work", () => {
    const s = projectStats(
      "ops",
      [
        ...tasks,
        t("est", { projectId: "ops", estimatedMinutes: 95 }),
        t("closed", { projectId: "ops", done: true }),
      ],
      TODAY
    );
    expect(s).toEqual({
      total: 4,
      open: 3,
      done: 1,
      late: 1,
      left: 95,
      pct: 0.25,
    });
    expect(cardLine(s)).toBe("3 tasks to do");
    expect(openLine({ open: 0, total: 2 })).toBe("All done");
    expect(openLine({ open: 0, total: 0 })).toBe("No tasks yet");
  });

  it("groups the project page by when, Done apart", () => {
    const g = projectGroups(
      "ds",
      [...tasks, t("ds-nodate", { projectId: "ds" })],
      TODAY
    );
    expect(g.groups.map((x) => [x.title, ids(x.tasks)])).toEqual([
      ["Upcoming", ["tomorrow", "far"]],
      ["No date", ["ds-nodate"]],
    ]);
    expect(ids(g.done)).toEqual(["today-done"]);
  });

  it("lists a card's next four open tasks by hour", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      t(`m${i}`, {
        projectId: "x",
        scheduledStart: `${TODAY}T${String(14 - i).padStart(2, "0")}:00`,
      })
    );
    expect(ids(cardTasks("x", many))).toEqual(["m5", "m4", "m3", "m2"]);
  });

  it("refuses a name another project has, ignoring case", () => {
    expect(nameTaken("operations", projects)).toBe(true);
    expect(nameTaken("Operations", projects, "ops")).toBe(false);
    expect(nameTaken("  ", projects)).toBe(false);
  });
});

describe("labels", () => {
  it("names upcoming days and durations", () => {
    expect(upcomingTitle("2026-09-02", TODAY)).toBe("Tomorrow, 2 Sep");
    expect(upcomingTitle("2026-09-03", TODAY)).toBe("Thursday, 3 Sep");
    expect(wkMins(95)).toBe("1 h 35 min");
    expect(wkMins(60)).toBe("1 h");
    expect(wkMins(20)).toBe("20 min");
  });
});
