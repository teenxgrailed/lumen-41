/**
 * The phone Tasks / Projects rules, against Tue 1 Sep 2026: which sections a
 * tab shows, the header numbers, what a drop into each section writes (the
 * specs fed to the real `dropPatch`), and the pull-down's hits.
 */
import type { V3Project, V3Task } from "@/lib/needt3/map";

import { dropPatch } from "../../drag";
import type { DropRequest } from "../../drag";
import {
  DONE_ZONE,
  deleteLine,
  deletedLabel,
  isAhead,
  openInProjects,
  projectHits,
  projectRow,
  projectSpecs,
  ptkHeader,
  ptkModel,
  ptkSpecs,
  taskHits,
} from "../model";

const TODAY = "2026-09-01";

const task = (id: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    done: false,
    isFixed: false,
    noSlot: false,
    trashedAt: null,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 30,
    projectId: null,
    ...over,
  }) as V3Task;

const project = (id: string, name: string): V3Project => ({
  id,
  name,
  color: null,
  icon: null,
  ground: null,
  position: 0,
  archived: false,
});

const ops = project("p-ops", "Operations");
const lab = project("p-lab", "Lab");

const tasks = [
  task("late", { dueDate: "2026-08-30" }),
  task("today", { projectId: ops.id }),
  task("today-done", { done: true }),
  task("tmrw", { dueDate: "2026-09-02", projectId: lab.id }),
  task("fri", { dueDate: "2026-09-04" }),
  task("far", { dueDate: "2026-09-20" }),
  task("inbox", { dueDate: null }),
  task("inbox-proj", { dueDate: null, projectId: ops.id }),
  task("gone", { dueDate: "2026-09-03", projectId: "p-archived" }),
  task("slotless", { noSlot: true }),
  task("trashed", { trashedAt: "2026-09-01T08:00:00Z" }),
];
const ids = (l: readonly V3Task[]) => l.map((t) => t.id);
const model = (tab: Parameters<typeof ptkModel>[0]["tab"], over = {}) =>
  ptkModel({ tasks, projects: [ops, lab], today: TODAY, tab, ...over });

describe("ptkModel: the tabs", () => {
  it("never counts a no-slot or trashed task", () => {
    expect(ids(model("all").live)).not.toContain("slotless");
    expect(ids(model("all").live)).not.toContain("trashed");
  });

  it("Inbox: the undated, project or not", () => {
    const m = model("inbox");
    expect(m.sections.map((s) => s.key)).toEqual(["inbox"]);
    expect(ids(m.sections[0].tasks).sort()).toEqual(["inbox", "inbox-proj"]);
  });

  it("Today: Overdue first (tone late), then today; ticked ones go to Done", () => {
    const m = model("today");
    expect(m.sections.map((s) => [s.key, s.tone])).toEqual([
      ["overdue", "late"],
      ["today", undefined],
    ]);
    expect(ids(m.sections[0].tasks)).toEqual(["late"]);
    expect(ids(m.sections[1].tasks)).toEqual(["today"]);
    expect(ids(m.done)).toEqual(["today-done"]);
  });

  it("Today sorts by hour, unplaced last", () => {
    const l = [
      task("b", { scheduledStart: `${TODAY}T14:00`, isFixed: true }),
      task("c"),
      task("a", { scheduledStart: `${TODAY}T09:30`, isFixed: true }),
    ];
    const m = ptkModel({ tasks: l, projects: [], today: TODAY, tab: "today" });
    expect(ids(m.sections[0].tasks)).toEqual(["a", "b", "c"]);
  });

  it("Upcoming: a section per day with tasks, inside the week", () => {
    const m = model("upcoming");
    expect(m.sections.map((s) => [s.day, s.title])).toEqual([
      ["2026-09-02", "Tomorrow, 2 Sep"],
      ["2026-09-03", "Thursday, 3 Sep"],
      ["2026-09-04", "Friday, 4 Sep"],
    ]);
    // 20 Sep is more than a week out
    expect(ids(m.scope)).not.toContain("far");
  });

  it("All: Inbox, each project's dated tasks, then No project (archived ones included)", () => {
    const m = model("all");
    expect(m.sections.map((s) => s.key)).toEqual([
      "inbox",
      "p-p-ops",
      "p-p-lab",
      "none",
    ]);
    const by = (k: string) => ids(m.sections.find((s) => s.key === k)!.tasks);
    expect(by("p-p-ops")).toEqual(["today"]);
    expect(by("p-p-lab")).toEqual(["tmrw"]);
    // filed under a project that is archived elsewhere: reads as no project
    expect(by("none")).toEqual(expect.arrayContaining(["gone", "late", "fri"]));
    // an undated project task sits in Inbox only, not twice
    expect(by("inbox")).toContain("inbox-proj");
    const all = m.sections.flatMap((s) => ids(s.tasks));
    expect(new Set(all).size).toBe(all.length);
  });

  it("counts open tasks per tab; All has none", () => {
    expect(model("all").counts).toEqual({
      inbox: 2,
      today: 2,
      upcoming: 3,
      all: null,
    });
  });

  it("isAhead: after today and not late", () => {
    expect(isAhead(task("x", { dueDate: "2026-09-02" }), TODAY)).toBe(true);
    expect(isAhead(task("x"), TODAY)).toBe(false);
    expect(isAhead(task("x", { dueDate: "2026-08-30" }), TODAY)).toBe(false);
    expect(isAhead(task("x", { dueDate: null }), TODAY)).toBe(false);
  });
});

describe("ptkHeader", () => {
  it("done of total, minutes left, overdue", () => {
    const h = ptkHeader(model("today").scope, TODAY);
    expect(h).toEqual({ doneN: 1, total: 3, openN: 2, mins: 60, late: 1 });
  });
  it("a row still leaving is not counted in the minutes", () => {
    const h = ptkHeader(model("today").scope, TODAY, { late: "done" });
    expect(h.mins).toBe(30);
  });
});

/* ---------- what a drop writes ---------- */

const drop = (
  id: string,
  from: string,
  to: string,
  after: string | null,
  before: string | null
): DropRequest => ({ id, from, to, after, before, folded: false });

describe("ptkSpecs and dropPatch", () => {
  it("Overdue and Done are locked: rows leave them, nothing comes in", () => {
    const m = model("today");
    const specs = ptkSpecs("today", m.sections, [ops, lab], TODAY);
    expect(specs.overdue.mode).toBe("none");
    expect(specs[DONE_ZONE].mode).toBe("none");
    expect(
      dropPatch(
        drop("today", "today", DONE_ZONE, null, null),
        specs,
        tasks,
        TODAY
      )
    ).toBeNull();
    expect(
      dropPatch(
        drop("today", "today", "overdue", null, null),
        specs,
        tasks,
        TODAY
      )
    ).toBeNull();
  });

  it("a row out of Overdue into Today takes today and a slot", () => {
    const m = model("today");
    const specs = ptkSpecs("today", m.sections, [], TODAY);
    const w = dropPatch(
      drop("late", "overdue", "today", null, "today"),
      specs,
      tasks,
      TODAY
    );
    expect(w?.id).toBe("late");
    expect(w?.patch.dueDate).toBe(TODAY);
    expect(w?.say).toMatch(/^Moved to Today/);
  });

  it("into Inbox clears the date, the time and the fixed flag", () => {
    const l = [task("t", { scheduledStart: `${TODAY}T10:00`, isFixed: true })];
    const specs = ptkSpecs("inbox", [], [], TODAY);
    const w = dropPatch(drop("t", "x", "inbox", null, null), specs, l, TODAY);
    expect(w?.patch).toMatchObject({
      dueDate: null,
      scheduledStart: null,
      isFixed: false,
    });
    expect(w?.say).toBe("Moved to Inbox");
  });

  it("Upcoming: each day's section carries its own date and the weekday as label", () => {
    const m = model("upcoming");
    const specs = ptkSpecs("upcoming", m.sections, [], TODAY);
    expect(specs["day-1"]).toMatchObject({
      date: "2026-09-02",
      label: "Tomorrow",
    });
    expect(specs["day-2"].label).toBe("Thursday");
    const w = dropPatch(
      drop("fri", "day-3", "day-2", null, null),
      specs,
      tasks,
      TODAY
    );
    expect(w?.patch.dueDate).toBe("2026-09-03");
    expect(w?.say).toBe("Moved to Thursday");
  });

  it("All: a drop on a project files the task under it, on the day of its neighbour", () => {
    const m = model("all");
    const specs = ptkSpecs("all", m.sections, [ops, lab], TODAY);
    const w = dropPatch(
      drop("fri", "none", "p-p-lab", "tmrw", null),
      specs,
      tasks,
      TODAY
    );
    expect(w?.patch.projectId).toBe("p-lab");
    expect(w?.patch.dueDate).toBe("2026-09-02");
    const none = dropPatch(
      drop("today", "p-p-ops", "none", null, null),
      specs,
      tasks,
      TODAY
    );
    expect(none?.patch.projectId).toBeNull();
    expect(none?.say).toBe("Moved to No project");
  });

  it("reordering inside a list that has nothing to say about order writes nothing", () => {
    // no manual-order column: the Inbox has no date or time to change
    const m = model("inbox");
    const specs = ptkSpecs("inbox", m.sections, [], TODAY);
    expect(
      dropPatch(
        drop("inbox", "inbox", "inbox", "inbox-proj", null),
        specs,
        tasks,
        TODAY
      )
    ).toBeNull();
  });

  it("a project's page has its own four zones", () => {
    const specs = projectSpecs(TODAY);
    expect(Object.keys(specs).sort()).toEqual(
      ["Done", "No date", "Overdue", "Today", "Upcoming"].sort()
    );
    const w = dropPatch(
      drop("today", "Today", "No date", null, null),
      specs,
      tasks,
      TODAY
    );
    expect(w?.patch.dueDate).toBeNull();
    expect(w?.say).toBe("Moved to No date");
  });
});

/* ---------- Projects ---------- */

describe("projects", () => {
  it("a row names the open count and the next task, soonest first", () => {
    const r = projectRow(ops, tasks);
    expect(r.open.map((t) => t.id)).toEqual(["today", "inbox-proj"]);
    // 'no day' sorts last
    expect(r.meta).toBe("2 open · next: Task today");
    expect(r.pct).toBe(0);
  });
  it("All done / No tasks yet", () => {
    const done = [task("a", { projectId: "p", done: true })];
    expect(projectRow({ id: "p" }, done)).toMatchObject({
      meta: "All done",
      pct: 1,
    });
    expect(projectRow({ id: "q" }, done).meta).toBe("No tasks yet");
  });
  it("the header counts open tasks of live projects only", () => {
    expect(openInProjects(tasks, [ops, lab])).toBe(3);
  });
  it("the Delete line and snack say where the open tasks go", () => {
    expect(deleteLine(0)).toBe("Its tasks stay, with no project");
    expect(deleteLine(1)).toBe("1 open task moves to No project");
    expect(deleteLine(3)).toBe("3 open tasks move to No project");
    expect(deletedLabel("Lab", 0)).toBe("Deleted “Lab”");
    expect(deletedLabel("Lab", 2)).toBe(
      "Deleted “Lab” — 2 tasks moved to No project"
    );
  });
});

describe("the pull-down", () => {
  it("finds titles by any word, five at most, and says where they are", () => {
    const live = model("all").live;
    const hits = taskHits(live, "TASK t", TODAY);
    expect(hits.map((h) => h.id)).toEqual(["today", "today-done", "tmrw"]);
    expect(hits[0].meta).toBe("Today");
    expect(hits[1].meta).toBe("Done");
    expect(hits[2].meta).toBe("2 Sep");
    expect(taskHits(live, "late", TODAY)[0].meta).toBe("Overdue");
    expect(taskHits(live, "inbox", TODAY)[0].meta).toBe("Inbox");
    expect(taskHits(live, "  ", TODAY)).toEqual([]);
    expect(taskHits(live, "task", TODAY)).toHaveLength(5);
  });
  it("finds projects by name", () => {
    expect(projectHits([ops, lab], tasks, "OPER")).toEqual([
      { id: "p-ops", title: "Operations", meta: "2 open" },
    ]);
  });
});
