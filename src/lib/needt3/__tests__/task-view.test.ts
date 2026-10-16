import { splitHome } from "@/components/needt3/home/derive";
import { projectGroups, workModel } from "@/components/needt3/work/model";

import { parseV3Fields, userSettingsV3FieldsSchema } from "../api-fields";
import type { V3Project, V3Task } from "../map";
import {
  DEFAULT_TASK_VIEW,
  type TaskViewSettings,
  comparatorFor,
  groupTasks,
  overdueOnTop,
  readTaskView,
  showsTask,
  sortTasks,
  taskViewError,
  taskViewOf,
} from "../task-view";

const TODAY = "2026-10-16";

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
const t = (id: string, o: Partial<V3Task> = {}): V3Task => ({
  ...base,
  id,
  title: id,
  ...o,
});
const view = (o: Partial<TaskViewSettings> = {}): TaskViewSettings => ({
  ...DEFAULT_TASK_VIEW,
  ...o,
});
const ids = (l: readonly { id: string }[]) => l.map((x) => x.id);
const projects: V3Project[] = [
  { id: "pa", name: "Alpha" },
  { id: "pb", name: "Beta" },
] as V3Project[];

describe("reading the setting", () => {
  it("falls to the old behaviour when nothing is stored", () => {
    expect(readTaskView(undefined)).toEqual(DEFAULT_TASK_VIEW);
    expect(readTaskView(null)).toEqual(DEFAULT_TASK_VIEW);
    expect(readTaskView("junk")).toEqual(DEFAULT_TASK_VIEW);
    expect(readTaskView([])).toEqual(DEFAULT_TASK_VIEW);
  });

  it("keeps what is valid and defaults what is not", () => {
    expect(
      readTaskView({
        completed: "hide",
        sort: "banana",
        subtasks: false,
        duration: "yes",
        group: "priority",
      })
    ).toEqual({
      ...DEFAULT_TASK_VIEW,
      completed: "hide",
      subtasks: false,
      group: "priority",
    });
  });

  it("reads it from the prefs map", () => {
    expect(taskViewOf({ taskView: { overdueFirst: false } }).overdueFirst).toBe(
      false
    );
    expect(taskViewOf(undefined)).toEqual(DEFAULT_TASK_VIEW);
  });
});

describe("what the API accepts", () => {
  it("accepts a full and a partial setting", () => {
    expect(taskViewError({ ...DEFAULT_TASK_VIEW })).toBeUndefined();
    expect(taskViewError({ sort: "due" })).toBeUndefined();
    expect(taskViewError({})).toBeUndefined();
  });

  it("names the first thing wrong", () => {
    expect(taskViewError("x")).toMatch(/object/);
    expect(taskViewError({ completed: "later" })).toMatch(/completed/);
    expect(taskViewError({ sort: "random" })).toMatch(/sort/);
    expect(taskViewError({ duration: "no" })).toMatch(/duration/);
    expect(taskViewError({ colour: "red" })).toMatch(/colour/);
  });
});

describe("Completed tasks", () => {
  const open = t("open");
  const doneToday = t("dt", { done: true, completedAt: `${TODAY}T09:30` });
  const doneBefore = t("db", { done: true, completedAt: "2026-10-14T18:00" });
  const justDone = t("jd", { done: true });

  it("always shows an open task", () => {
    for (const completed of ["hide", "today", "always"] as const)
      expect(showsTask(open, { completed }, TODAY)).toBe(true);
  });

  it("hide: no closed task", () => {
    const v = { completed: "hide" } as const;
    expect(
      [doneToday, doneBefore, justDone].map((x) => showsTask(x, v, TODAY))
    ).toEqual([false, false, false]);
  });

  it("today: only what was closed today, a just-closed task included", () => {
    const v = { completed: "today" } as const;
    expect(showsTask(doneToday, v, TODAY)).toBe(true);
    expect(showsTask(justDone, v, TODAY)).toBe(true);
    expect(showsTask(doneBefore, v, TODAY)).toBe(false);
  });

  it("always: every closed task", () => {
    const v = { completed: "always" } as const;
    expect(showsTask(doneBefore, v, TODAY)).toBe(true);
  });
});

describe("sorting", () => {
  const a = t("a", {
    priority: "low",
    dueDate: "2026-10-20",
    scheduledStart: "2026-10-16T14:00",
  });
  const b = t("b", {
    priority: "urgent",
    dueDate: "2026-10-25",
    scheduledStart: "2026-10-16T09:00",
  });
  const c = t("c", { priority: "high", dueDate: "2026-10-18" });
  const d = t("d", { priority: "high" });

  it("time: by the hour, unplaced last", () => {
    expect(ids(sortTasks([a, c, b], "time"))).toEqual(["b", "a", "c"]);
  });

  it("priority: urgent first, ties by time", () => {
    expect(ids(sortTasks([a, c, b, d], "priority"))).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("due: by due day, no day last", () => {
    expect(ids(sortTasks([b, d, a, c], "due"))).toEqual(["c", "a", "b", "d"]);
  });

  it("does not mutate its input", () => {
    const list = [a, b];
    sortTasks(list, "priority");
    expect(ids(list)).toEqual(["a", "b"]);
    expect(comparatorFor("time")(a, a)).toBe(0);
  });
});

describe("grouping", () => {
  const list = [
    t("1", { projectId: "pb", priority: "low" }),
    t("2", { projectId: "pa", priority: "urgent" }),
    t("3", { projectId: null, priority: "urgent" }),
    t("4", { projectId: "gone", priority: "medium" }),
  ];

  it("by project: in the project order, a missing project reads as none", () => {
    const g = groupTasks(list, "project", "time", projects);
    expect(g.map((s) => [s.title, ids(s.tasks)])).toEqual([
      ["Alpha", ["2"]],
      ["Beta", ["1"]],
      ["No project", ["3", "4"]],
    ]);
  });

  it("by priority: urgent to low, empty groups dropped", () => {
    const g = groupTasks(list, "priority", "time", projects);
    expect(g.map((s) => [s.title, ids(s.tasks)])).toEqual([
      ["Urgent", ["2", "3"]],
      ["Medium", ["4"]],
      ["Low", ["1"]],
    ]);
  });
});

describe("overdue on top", () => {
  const late = t("late", { dueDate: "2026-10-10" });
  const later = t("later", { dueDate: "2026-10-12" });
  const now = t("now", { dueDate: TODAY });
  const sections = [
    { key: "today", title: "Today", tasks: [now, late] },
    { key: "p-x", title: "X", tasks: [later] },
  ];

  it("pulls the overdue ones into a section of their own, first", () => {
    const out = overdueOnTop(sections, true, TODAY, "due");
    expect(out.map((s) => [s.key, ids(s.tasks)])).toEqual([
      ["overdue", ["late", "later"]],
      ["today", ["now"]],
    ]);
    expect(out[0].tone).toBe("late");
  });

  it("off: an Overdue section is dissolved into Today, in the sort order", () => {
    const withOverdue = [
      {
        key: "overdue",
        title: "Overdue",
        tone: "late" as const,
        tasks: [late],
      },
      { key: "today", title: "Today", tasks: [now] },
    ];
    const out = overdueOnTop(withOverdue, false, TODAY, "due");
    expect(out.map((s) => [s.key, ids(s.tasks)])).toEqual([
      ["today", ["late", "now"]],
    ]);
  });

  it("off, with no Overdue section: the sections are left alone", () => {
    expect(overdueOnTop(sections, false, TODAY, "time")).toEqual(sections);
  });
});

describe("the Tasks list follows the setting", () => {
  const tasks = [
    t("lo", { projectId: "pa", priority: "low", dueDate: "2026-10-20" }),
    t("hi", { projectId: "pb", priority: "urgent", dueDate: "2026-10-18" }),
    t("late", { projectId: "pa", priority: "medium", dueDate: "2026-10-12" }),
    t("d1", { done: true, projectId: "pa", completedAt: `${TODAY}T08:00` }),
    t("d0", { done: true, projectId: "pa", completedAt: "2026-10-01T08:00" }),
  ];
  const model = (v: Partial<TaskViewSettings>, tab: "all" | "today" = "all") =>
    workModel({ tasks, projects, today: TODAY, tab, view: view(v) });
  const shape = (m: ReturnType<typeof model>) =>
    m.sections.map((s) => [s.title, ids(s.tasks)]);

  it("is the old list with the default view", () => {
    const old = workModel({ tasks, projects, today: TODAY, tab: "all" });
    expect(model({})).toEqual(old);
  });

  it("Group by priority replaces the day sections", () => {
    expect(shape(model({ group: "priority", overdueFirst: false }))).toEqual([
      ["Urgent", ["hi"]],
      ["Medium", ["late"]],
      ["Low", ["lo"]],
    ]);
  });

  it("Group by project, and Overdue first lifts the late one out of it", () => {
    expect(shape(model({ group: "project", overdueFirst: false }))).toEqual([
      ["Alpha", ["late", "lo"]],
      ["Beta", ["hi"]],
    ]);
    expect(shape(model({ group: "project" }))).toEqual([
      ["Overdue", ["late"]],
      ["Alpha", ["lo"]],
      ["Beta", ["hi"]],
    ]);
  });

  it("Sort changes the order inside a section", () => {
    expect(
      shape(model({ group: "project", overdueFirst: false, sort: "due" }))[0]
    ).toEqual(["Alpha", ["late", "lo"]]);
    expect(
      shape(model({ group: "priority", sort: "due", overdueFirst: false })).map(
        ([title]) => title
      )
    ).toEqual(["Urgent", "Medium", "Low"]);
  });

  it("Overdue off merges Overdue into Today on the Today tab", () => {
    const m = model({ overdueFirst: false, sort: "due" }, "today");
    expect(shape(m)).toEqual([["Today", ["late"]]]);
    expect(shape(model({}, "today"))).toEqual([["Overdue", ["late"]]]);
  });

  it("Completed tasks decides the Done list", () => {
    expect(ids(model({ completed: "always" }).done).sort()).toEqual([
      "d0",
      "d1",
    ]);
    expect(ids(model({ completed: "today" }).done)).toEqual(["d1"]);
    expect(model({ completed: "hide" }).done).toEqual([]);
  });
});

describe("a project page follows the setting", () => {
  const tasks = [
    t("a", { projectId: "pa", priority: "low", dueDate: TODAY }),
    t("b", { projectId: "pa", priority: "urgent", dueDate: TODAY }),
    t("late", { projectId: "pa", dueDate: "2026-10-10" }),
    t("d", { projectId: "pa", done: true, completedAt: "2026-10-01T10:00" }),
  ];

  it("Sort by priority reorders Today", () => {
    const g = projectGroups("pa", tasks, TODAY, view({ sort: "priority" }));
    expect(ids(g.groups.find((x) => x.key === "Today")!.tasks)).toEqual([
      "b",
      "a",
    ]);
  });

  it("Overdue first off folds Overdue into Today", () => {
    const g = projectGroups(
      "pa",
      tasks,
      TODAY,
      view({ overdueFirst: false, sort: "due" })
    );
    expect(g.groups.map((x) => x.key)).toEqual(["Today"]);
    expect(ids(g.groups[0].tasks)).toEqual(["late", "a", "b"]);
  });

  it("Completed: hide empties the Done list, today drops an older one", () => {
    expect(
      projectGroups("pa", tasks, TODAY, view({ completed: "hide" })).done
    ).toEqual([]);
    expect(
      projectGroups("pa", tasks, TODAY, view({ completed: "today" })).done
    ).toEqual([]);
    expect(ids(projectGroups("pa", tasks, TODAY, view()).done)).toEqual(["d"]);
  });
});

describe("Home follows the setting", () => {
  const tasks = [
    t("x", {
      dueDate: TODAY,
      priority: "low",
      scheduledStart: `${TODAY}T09:00`,
    }),
    t("y", {
      dueDate: TODAY,
      priority: "urgent",
      scheduledStart: `${TODAY}T11:00`,
    }),
    t("l1", { dueDate: "2026-10-12", priority: "low" }),
    t("l2", { dueDate: "2026-10-14", priority: "urgent" }),
  ];

  it("time keeps Home's own order", () => {
    const s = splitHome(tasks, TODAY, view());
    expect(ids(s.day)).toEqual(["x", "y"]);
    expect(ids(s.late)).toEqual(["l1", "l2"]);
  });

  it("priority reorders the day and the late list", () => {
    const s = splitHome(tasks, TODAY, view({ sort: "priority" }));
    expect(ids(s.day)).toEqual(["y", "x"]);
    expect(ids(s.late)).toEqual(["l2", "l1"]);
  });
});

describe("the settings API", () => {
  it("takes prefs with a valid taskView, and prefs without one", () => {
    expect(
      parseV3Fields(userSettingsV3FieldsSchema, {
        prefs: { taskView: { completed: "hide" }, other: 1 },
      }).ok
    ).toBe(true);
    expect(
      parseV3Fields(userSettingsV3FieldsSchema, { prefs: { accent: "red" } }).ok
    ).toBe(true);
  });

  it("answers a bad taskView with the reason, not a stored typo", () => {
    const r = parseV3Fields(userSettingsV3FieldsSchema, {
      prefs: { taskView: { sort: "random" } },
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/taskView\.sort/);
  });
});
