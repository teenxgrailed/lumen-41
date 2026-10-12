/**
 * The one day rule (owner decision 2026-10-12): OVERDUE = open and due before
 * today in the person's zone; due/scheduled today = Today, even when the
 * block's time has passed. Every surface reads `task-day`, so these tests pin
 * that Home (desktop + phone), Tasks (desktop + phone), the sidebar badge and
 * Move to today agree on the same fixture.
 */
import { splitHome } from "@/components/needt3/home/derive";
import { homeView, moveLate } from "@/components/needt3/phone/home/model";
import { dayIn } from "@/components/needt3/phone/overlays/today";
import { ptkModel } from "@/components/needt3/phone/tasks/model";
import { overdueCount as sidebarOverdue } from "@/components/needt3/shell/live";
import { projectGroups, workModel } from "@/components/needt3/work/model";

import { moveOverdue } from "@/lib/needt3/day";
import { type ApiTask, type V3Task, taskFromApi } from "@/lib/needt3/map";
import {
  hourOn,
  isOnToday,
  isOverdue,
  overdueCount,
  taskDay,
  todayTasks,
} from "@/lib/needt3/task-day";

const TODAY = "2026-10-12";

let n = 0;
const task = (over: Partial<V3Task> = {}): V3Task =>
  ({
    id: `t${++n}`,
    title: `Task ${n}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: null,
    estimatedMinutes: 30,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    auto: false,
    noSlot: false,
    trashedAt: null,
    ...over,
  }) as V3Task;

describe("isOverdue / taskDay", () => {
  it("overdue only when open and due before today", () => {
    expect(isOverdue(task({ dueDate: "2026-10-11" }), TODAY)).toBe(true);
    expect(isOverdue(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(task({ dueDate: "2026-10-11", done: true }), TODAY)).toBe(
      false
    );
    expect(
      isOverdue(task({ dueDate: "2026-10-11", noSlot: true }), TODAY)
    ).toBe(false);
    expect(
      isOverdue(
        task({ dueDate: "2026-10-11", trashedAt: "2026-10-12T08:00" }),
        TODAY
      )
    ).toBe(false);
  });

  it("a passed block does not make a task overdue", () => {
    // due today, its block this morning already over
    const a = task({ dueDate: TODAY, scheduledStart: `${TODAY}T07:00` });
    // no due date, block yesterday at 19:00 (the "only a time" rows)
    const b = task({ scheduledStart: "2026-10-11T19:00" });
    // due Friday, block yesterday at 21:00
    const c = task({
      dueDate: "2026-10-16",
      scheduledStart: "2026-10-11T21:00",
    });
    for (const t of [a, b, c]) expect(isOverdue(t, TODAY)).toBe(false);
    expect(taskDay(a, TODAY)).toBe(TODAY);
    expect(taskDay(b, TODAY)).toBeNull();
    expect(taskDay(c, TODAY)).toBe("2026-10-16");
  });

  it("due today or scheduled today is Today; a block elsewhere gives no hour today", () => {
    const dueOnly = task({ dueDate: TODAY });
    const schedOnly = task({ scheduledStart: `${TODAY}T15:30` });
    const dueTodayBlockTomorrow = task({
      dueDate: TODAY,
      scheduledStart: "2026-10-13T09:00",
    });
    expect(isOnToday(dueOnly, TODAY)).toBe(true);
    expect(isOnToday(schedOnly, TODAY)).toBe(true);
    expect(isOnToday(dueTodayBlockTomorrow, TODAY)).toBe(true);
    expect(hourOn(schedOnly, TODAY)).toBe(15.5);
    expect(hourOn(dueTodayBlockTomorrow, TODAY)).toBeNull();
    expect(
      todayTasks([dueOnly, dueTodayBlockTomorrow, schedOnly], TODAY).map(
        (t) => t.id
      )
    ).toEqual([schedOnly.id, dueOnly.id, dueTodayBlockTomorrow.id]);
  });
});

describe("every surface counts the same overdue", () => {
  // The owner's mix: 3 truly overdue, and 5 that only a stale block or a
  // passed time made the old Home call overdue.
  const late = [
    task({ dueDate: "2026-10-09" }),
    task({ dueDate: "2026-10-10", scheduledStart: "2026-10-10T10:00" }),
    task({ dueDate: "2026-10-11" }),
  ];
  const notLate = [
    task({ scheduledStart: "2026-10-11T19:00" }),
    task({ scheduledStart: "2026-10-11T21:00" }),
    task({ dueDate: "2026-10-15", scheduledStart: "2026-10-10T09:00" }),
    task({ dueDate: TODAY, scheduledStart: `${TODAY}T07:00` }),
    task({ dueDate: TODAY, scheduledStart: "2026-10-11T18:00" }),
  ];
  const scheduledToday = task({ scheduledStart: `${TODAY}T16:00` });
  const all = [...late, ...notLate, scheduledToday];
  const lateIds = late.map((t) => t.id).sort();

  it("Home desktop, Home phone, Tasks desktop, Tasks phone, sidebar: 3", () => {
    expect(overdueCount(all, TODAY)).toBe(3);
    expect(
      splitHome(all, TODAY)
        .late.map((t) => t.id)
        .sort()
    ).toEqual(lateIds);
    expect(homeView(all, TODAY).lateN).toBe(3);
    const desk = workModel({
      tasks: all,
      projects: [],
      today: TODAY,
      tab: "today",
    });
    expect(desk.sections.find((s) => s.key === "overdue")?.tasks).toHaveLength(
      3
    );
    const phone = ptkModel({
      tasks: all,
      projects: [],
      today: TODAY,
      tab: "today",
    });
    expect(phone.sections.find((s) => s.key === "overdue")?.tasks).toHaveLength(
      3
    );
    expect(sidebarOverdue(all, TODAY)).toBe(3);
  });

  it("Today holds the due-today and scheduled-today tasks on every face", () => {
    const todayIds = [notLate[3], notLate[4], scheduledToday]
      .map((t) => t.id)
      .sort();
    expect(
      splitHome(all, TODAY)
        .day.map((t) => t.id)
        .sort()
    ).toEqual(todayIds);
    const desk = workModel({
      tasks: all,
      projects: [],
      today: TODAY,
      tab: "today",
    });
    expect(
      desk.sections
        .find((s) => s.key === "today")
        ?.tasks.map((t) => t.id)
        .sort()
    ).toEqual(todayIds);
    expect(desk.counts.today).toBe(6);
    const phone = ptkModel({
      tasks: all,
      projects: [],
      today: TODAY,
      tab: "today",
    });
    expect(
      phone.sections
        .find((s) => s.key === "today")
        ?.tasks.map((t) => t.id)
        .sort()
    ).toEqual(todayIds);
    expect(phone.counts.today).toBe(6);
  });

  it("Move to today (desktop Home, phone Home, phone Tasks) moves the same 3", () => {
    const home = moveLate(splitHome(all, TODAY).late, TODAY);
    const tasks = moveOverdue(all, TODAY);
    expect(home?.moves.map((m) => m.id).sort()).toEqual(lateIds);
    expect(tasks?.moves.map((m) => m.id).sort()).toEqual(lateIds);
    expect(home?.label).toBe("3 tasks moved to today");
  });
});

describe("time zones west and east of UTC", () => {
  const api = (over: Partial<ApiTask>): ApiTask => ({
    id: "a",
    title: "A",
    status: "todo",
    ...over,
  });

  // 2026-10-12 03:30 UTC: still the 11th in Los Angeles, the 12th in Tokyo.
  const NOW = new Date("2026-10-12T03:30:00Z");

  it("today is the person's day in their zone", () => {
    expect(dayIn(NOW, "America/Los_Angeles")).toBe("2026-10-11");
    expect(dayIn(NOW, "Asia/Tokyo")).toBe("2026-10-12");
    expect(dayIn(NOW, "Europe/Kyiv")).toBe("2026-10-12");
  });

  it("a date-only due (UTC midnight) keeps its day west of UTC", () => {
    const row = api({ dueDate: "2026-10-12T00:00:00.000Z" });
    const la = taskFromApi(row, "America/Los_Angeles");
    const tokyo = taskFromApi(row, "Asia/Tokyo");
    expect(la.dueDate).toBe("2026-10-12");
    expect(tokyo.dueDate).toBe("2026-10-12");
    // in LA on the 12th it is today's, not yesterday's overdue
    expect(isOverdue(la, "2026-10-12")).toBe(false);
    expect(isOnToday(la, "2026-10-12")).toBe(true);
  });

  it("a local-midnight due (what v3 writes) reads back as that day", () => {
    // 2026-10-12 00:00 in LA (UTC-7) and in Kyiv (UTC+3)
    const la = taskFromApi(
      api({ dueDate: "2026-10-12T07:00:00.000Z" }),
      "America/Los_Angeles"
    );
    const kyiv = taskFromApi(
      api({ dueDate: "2026-10-11T21:00:00.000Z" }),
      "Europe/Kyiv"
    );
    expect(la.dueDate).toBe("2026-10-12");
    expect(kyiv.dueDate).toBe("2026-10-12");
  });

  it("due the 11th is overdue on the 12th in the zone's own day, not UTC's", () => {
    const row = api({ dueDate: "2026-10-11T00:00:00.000Z" });
    // at NOW Los Angeles is still on the 11th: due today, not overdue
    const la = taskFromApi(row, "America/Los_Angeles");
    expect(isOverdue(la, dayIn(NOW, "America/Los_Angeles"))).toBe(false);
    // Tokyo is already on the 12th: overdue
    const tokyo = taskFromApi(row, "Asia/Tokyo");
    expect(isOverdue(tokyo, dayIn(NOW, "Asia/Tokyo"))).toBe(true);
  });

  it("a block that passed late yesterday east of UTC is not overdue", () => {
    // 21:00 in Kyiv on the 11th = 18:00Z; due today in Kyiv
    const t = taskFromApi(
      api({
        dueDate: "2026-10-11T21:00:00.000Z",
        scheduledStart: "2026-10-11T18:00:00.000Z",
        scheduledEnd: "2026-10-11T18:30:00.000Z",
      }),
      "Europe/Kyiv"
    );
    expect(t.scheduledStart).toBe("2026-10-11T21:00");
    expect(isOverdue(t, "2026-10-12")).toBe(false);
    expect(isOnToday(t, "2026-10-12")).toBe(true);
  });
});

describe("every open task lands in exactly one group", () => {
  const P = "proj-1";
  const mix = (over: Partial<V3Task>[]) =>
    over.map((o) => task({ projectId: P, ...o }));
  const all = mix([
    { dueDate: "2026-10-11" }, // overdue
    { dueDate: "2026-10-11", noSlot: true }, // no slot, due yesterday
    { dueDate: TODAY, noSlot: true }, // no slot, due today
    { dueDate: "2026-10-20", noSlot: true }, // no slot, due later
    { dueDate: TODAY }, // today
    { scheduledStart: `${TODAY}T15:00` }, // scheduled today
    { scheduledStart: "2026-10-11T19:00" }, // stale block, no due date
    { dueDate: "2026-10-15", scheduledStart: "2026-10-10T09:00" }, // later
    { dueDate: "2026-10-30" }, // beyond Upcoming's week
    {}, // no date
    { dueDate: "2026-10-11", done: true }, // done: Done list only
  ]);
  const ids = (l: readonly V3Task[]) => l.map((t) => t.id).sort();
  const openIds = ids(all.filter((t) => !t.done));

  it("project page: the groups cover every open task once (noSlot due yesterday included)", () => {
    const { groups, done } = projectGroups(P, all, TODAY);
    const seen = groups.flatMap((g) => g.tasks.map((t) => t.id));
    expect(seen.sort()).toEqual(openIds);
    expect(new Set(seen).size).toBe(seen.length);
    expect(
      groups.find((g) => g.key === "No date")?.tasks.map((t) => t.id)
    ).toContain(all[1].id);
    expect(done.map((t) => t.id)).toEqual([all[10].id]);
  });

  it("Tasks desktop + phone, Today tab: Overdue and Today are disjoint and cover the tab", () => {
    const live = all.filter((t) => !t.done && !t.noSlot);
    const want = ids(
      live.filter((t) => isOverdue(t, TODAY) || isOnToday(t, TODAY))
    );
    for (const m of [
      workModel({ tasks: all, projects: [], today: TODAY, tab: "today" }),
      ptkModel({ tasks: all, projects: [], today: TODAY, tab: "today" }),
    ]) {
      const seen = m.sections.flatMap((s) => s.tasks.map((t) => t.id));
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.sort()).toEqual(want);
      expect(m.counts.today).toBe(want.length);
    }
  });

  it("Tasks desktop + phone: Inbox, Today and Upcoming never share a task", () => {
    for (const make of [workModel, ptkModel] as const) {
      const seen = (["inbox", "today", "upcoming"] as const).flatMap((tab) =>
        make({ tasks: all, projects: [], today: TODAY, tab }).sections.flatMap(
          (s) => s.tasks.map((t) => t.id)
        )
      );
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("Home: late, day and inbox are disjoint; the rest of the open work is ahead", () => {
    const { late, day, inbox } = splitHome(all, TODAY);
    const seen = [...late, ...day.filter((t) => !t.done), ...inbox].map(
      (t) => t.id
    );
    expect(new Set(seen).size).toBe(seen.length);
    const rest = all.filter(
      (t) => !t.done && !t.noSlot && !seen.includes(t.id)
    );
    for (const t of rest) expect(taskDay(t, TODAY)! > TODAY).toBe(true);
  });
});
