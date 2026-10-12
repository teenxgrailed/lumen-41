import type { V3Event, V3Task } from "@/lib/needt3/map";

import {
  capacityFrom,
  cappedCount,
  dayState,
  dayStats,
  dur,
  hours,
  nextUpNote,
  partOf,
  pickNextUp,
  proFromPlan,
  scheduleItems,
  scheduleWindow,
  sectionsOf,
  skipNext,
  splitHome,
  weekAhead,
  weekTotals,
} from "../derive";

const TODAY = "2026-09-01";

let n = 0;
const task = (over: Partial<V3Task> = {}): V3Task =>
  ({
    id: `t${++n}`,
    title: `Task ${n}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: TODAY,
    estimatedMinutes: 30,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    auto: false,
    noSlot: false,
    trashedAt: null,
    parts: [],
    waits: [],
    ...over,
  }) as V3Task;

const at = (day: string, hhmm: string) => `${day}T${hhmm}`;

describe("splitHome", () => {
  it("separates overdue, today and the inbox", () => {
    const late = task({ dueDate: "2026-08-30" });
    const lateDone = task({ dueDate: "2026-08-30", done: true });
    const now = task();
    const placed = task({ dueDate: null, scheduledStart: at(TODAY, "10:00") });
    const free = task({ dueDate: null });
    const fixed = task({ dueDate: null, isFixed: true });
    const noSlot = task({ dueDate: "2026-08-30", noSlot: true });
    const trashed = task({ trashedAt: "2026-08-31T10:00:00Z" });
    const s = splitHome(
      [late, lateDone, now, placed, free, fixed, noSlot, trashed],
      TODAY
    );
    expect(s.late.map((t) => t.id)).toEqual([late.id]);
    expect(s.day.map((t) => t.id).sort()).toEqual([now.id, placed.id].sort());
    expect(s.inbox.map((t) => t.id)).toEqual([free.id]);
  });

  it("orders today by hour with untimed last, overdue oldest first", () => {
    const a = task({ scheduledStart: at(TODAY, "15:00") });
    const b = task({ scheduledStart: at(TODAY, "09:00") });
    const c = task();
    const l2 = task({ dueDate: "2026-08-31" });
    const l1 = task({ dueDate: "2026-08-29" });
    const s = splitHome([a, c, b, l2, l1], TODAY);
    expect(s.day.map((t) => t.id)).toEqual([b.id, a.id, c.id]);
    expect(s.late.map((t) => t.id)).toEqual([l1.id, l2.id]);
  });
});

describe("dayStats and dayState", () => {
  it("counts done and open minutes", () => {
    const day = [
      task({ done: true }),
      task({ estimatedMinutes: 45 }),
      task({ estimatedMinutes: 15 }),
    ];
    expect(dayStats(day)).toEqual({ total: 3, done: 1, left: 2, mins: 60 });
  });

  it("is empty with nothing due and nothing overdue", () => {
    expect(dayState([], 0)).toBe("empty");
    expect(dayState([], 2)).toBe("open");
  });

  it("closes when every task of the day is done, not while a row is leaving", () => {
    const a = task({ done: true });
    const b = task({ done: true });
    expect(dayState([a, b], 0)).toBe("closed");
    expect(dayState([a, b], 3)).toBe("closed");
    expect(dayState([a, b], 0, new Set([b.id]))).toBe("open");
    expect(dayState([a, task()], 0)).toBe("open");
  });
});

describe("pickNextUp", () => {
  const late1 = task({ dueDate: "2026-08-29" });
  const late2 = task({ dueDate: "2026-08-31" });
  const d1 = task({ scheduledStart: at(TODAY, "10:00"), estimatedMinutes: 30 });
  const d2 = task({ scheduledStart: at(TODAY, "13:00") });

  it("takes the oldest overdue first", () => {
    const p = pickNextUp([late1, late2], [d1, d2])!;
    expect(p.task.id).toBe(late1.id);
    expect(p.moreLate).toBe(1);
    expect(p.after).toBeNull();
    expect(p.canSkip).toBe(true);
  });

  it("takes today by hour when nothing is overdue, with the next timed one after it", () => {
    const p = pickNextUp([], [d1, d2])!;
    expect(p.task.id).toBe(d1.id);
    expect(p.after?.id).toBe(d2.id);
  });

  it("skips, then starts over when only one is left", () => {
    const p = pickNextUp([], [d1, d2], [d1.id])!;
    expect(p.task.id).toBe(d2.id);
    expect(skipNext([d1.id], p, 1)).toEqual([]);
    expect(skipNext([], pickNextUp([], [d1, d2])!, 2)).toEqual([d1.id]);
  });

  it("is null with nothing open and cannot skip a single one", () => {
    expect(pickNextUp([], [])).toBeNull();
    expect(pickNextUp([], [d1])!.canSkip).toBe(false);
  });

  it("explains the pick", () => {
    expect(nextUpNote(pickNextUp([late1], [d1])!, 14.33, TODAY)).toBe(
      "Overdue since 29 Aug · the oldest thing still open, 30 min"
    );
    expect(nextUpNote(pickNextUp([], [d1])!, 14.33, TODAY)).toBe(
      "Was planned for 10:00 · still open, 30 min"
    );
    expect(nextUpNote(pickNextUp([], [d1, d2])!, 8, TODAY)).toBe(
      "Due today · 30 min fits before 13:00"
    );
    expect(
      nextUpNote(pickNextUp([], [task({ estimatedMinutes: null })])!, 8, TODAY)
    ).toBe("Due today");
  });
});

describe("sections", () => {
  it("groups by part of day and drops empty parts", () => {
    const m = task({ scheduledStart: at(TODAY, "09:00") });
    const e = task({ scheduledStart: at(TODAY, "18:00") });
    const any = task();
    const out = sectionsOf([m, e, any], () => true);
    expect(out.map(([p]) => p)).toEqual([
      "Morning",
      "Evening",
      "Anytime today",
    ]);
  });

  it("partOf follows the prototype's 12 and 17 o'clock", () => {
    expect(partOf(11.9)).toBe("Morning");
    expect(partOf(12)).toBe("Afternoon");
    expect(partOf(17)).toBe("Evening");
    expect(partOf(null)).toBeNull();
  });
});

describe("labels and caps", () => {
  it("formats durations", () => {
    expect(dur(null)).toBe("");
    expect(dur(25)).toBe("25 min");
    expect(dur(90)).toBe("1 h 30");
    expect(hours(0)).toBe("0 h");
    expect(hours(45)).toBe("45 min");
    expect(hours(150)).toBe("2 h 30");
  });

  it("shows a small overflow in full and caps a big one", () => {
    expect(cappedCount(30, false)).toEqual({ over: false, shown: 30 });
    expect(cappedCount(31, false)).toEqual({ over: true, shown: 25 });
    expect(cappedCount(31, true)).toEqual({ over: true, shown: 31 });
  });

  it("windows a packed schedule around the now line", () => {
    const rows = Array.from({ length: 60 }, (_, i) => i);
    expect(scheduleWindow(rows, 30, false)).toHaveLength(24);
    expect(scheduleWindow(rows, 30, false)[0]).toBe(24);
    expect(scheduleWindow(rows, 30, true)).toHaveLength(60);
    expect(scheduleWindow(rows.slice(0, 10), 5, false)).toHaveLength(10);
  });
});

describe("scheduleItems", () => {
  it("merges today's events and timed tasks, events first at a tie", () => {
    const ev: V3Event = {
      id: "e1",
      title: "Standup",
      startAt: at(TODAY, "10:00"),
      endAt: at(TODAY, "10:15"),
      isAllDay: false,
      calendarId: "c",
      source: "needt",
      externalId: null,
    };
    const tomorrow: V3Event = {
      ...ev,
      id: "e2",
      startAt: at("2026-09-02", "10:00"),
      endAt: at("2026-09-02", "11:00"),
    };
    const t = task({ scheduledStart: at(TODAY, "10:00") });
    const t2 = task({ scheduledStart: at(TODAY, "09:00") });
    const items = scheduleItems([t, t2, task()], [ev, tomorrow], TODAY);
    expect(items.map((i) => i.key)).toEqual([`t${t2.id}`, "ee1", `t${t.id}`]);
    expect(items[1].len).toBe(15);
  });
});

describe("week ahead", () => {
  const cap = capacityFrom(undefined);

  it("defaults to a 9 h day with no weekends", () => {
    expect(cap).toEqual({
      min: 540,
      weekends: false,
      start: "09:00",
      end: "18:00",
    });
    expect(
      capacityFrom({ start: "08:30", end: "12:30", weekends: true }).min
    ).toBe(240);
  });

  it("starts tomorrow and sets weekends to no capacity", () => {
    const days = weekAhead([], [], TODAY, cap);
    expect(days).toHaveLength(7);
    expect(days[0].title).toBe("Tomorrow, 2 Sep");
    expect(days[1].title).toBe("Thursday, 3 Sep");
    expect(days.map((d) => d.short)).toEqual([
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
      "Mon",
      "Tue",
    ]);
    expect(days.map((d) => d.cap)).toEqual([540, 540, 540, 0, 0, 540, 540]);
  });

  it("plans open estimates plus event minutes and totals the week", () => {
    const wed = "2026-09-02";
    const ev: V3Event = {
      id: "e",
      title: "Review",
      startAt: at(wed, "11:00"),
      endAt: at(wed, "12:00"),
      isAllDay: false,
      calendarId: "c",
      source: "needt",
      externalId: null,
    };
    const tasks = [
      task({ dueDate: wed, estimatedMinutes: 120 }),
      task({ dueDate: wed, estimatedMinutes: 30, done: true }),
    ];
    const days = weekAhead(tasks, [ev], TODAY, cap);
    expect(days[0].planned).toBe(180);
    const tot = weekTotals(days);
    expect(tot).toMatchObject({
      tasks: 2,
      done: 1,
      planned: 180,
      cap: 540 * 5,
    });
  });
});

describe("placement comes from scheduledStart", () => {
  const FRIDAY = "2026-09-04";
  const TOMORROW = "2026-09-02";

  it("due today but scheduled tomorrow 09:00 is not today's", () => {
    const t = task({ dueDate: TODAY, scheduledStart: at(TOMORROW, "09:00") });
    const s = splitHome([t], TODAY);
    expect(s.day).toEqual([]);
    expect(s.late).toEqual([]);
    expect(scheduleItems([t], [], TODAY)).toEqual([]);
    // the day list never gives it today's hour, so no "Was planned for 09:00"
    const pick = pickNextUp([], [t]);
    expect(nextUpNote(pick!, 14, TODAY)).not.toContain("09:00");
    // it is tomorrow's, at 09:00
    const week = weekAhead([t], [], TODAY, capacityFrom(undefined));
    expect(week[0].date).toBe(TOMORROW);
    expect(week[0].tasks.map((x) => x.id)).toEqual([t.id]);
  });

  it("scheduled today 10:00 and due Friday sits on today at 10:00", () => {
    const t = task({ dueDate: FRIDAY, scheduledStart: at(TODAY, "10:00") });
    const s = splitHome([t], TODAY);
    expect(s.day.map((x) => x.id)).toEqual([t.id]);
    expect(sectionsOf(s.day, () => true)).toEqual([["Morning", [t]]]);
    expect(scheduleItems(s.day, [], TODAY)).toMatchObject([
      { id: t.id, at: 10 },
    ]);
    expect(nextUpNote(pickNextUp([], s.day)!, 8, TODAY)).toBe(
      "Today · 30 min of work"
    );
    const week = weekAhead([t], [], TODAY, capacityFrom(undefined));
    expect(week.some((d) => d.tasks.length)).toBe(false);
  });

  it("a due-only task is in today's list without an hour", () => {
    const t = task({ dueDate: TODAY });
    const s = splitHome([t], TODAY);
    expect(s.day.map((x) => x.id)).toEqual([t.id]);
    expect(sectionsOf(s.day, () => true)).toEqual([["Anytime today", [t]]]);
    expect(scheduleItems(s.day, [], TODAY)).toEqual([]);
  });
});

describe("proFromPlan", () => {
  it("unlocks only a known paid plan; unknown is neither", () => {
    expect(proFromPlan(undefined)).toBeNull();
    expect(proFromPlan(null)).toBeNull();
    expect(proFromPlan("free")).toBe(false);
    expect(proFromPlan("trial")).toBe(true);
    expect(proFromPlan("lifetime")).toBe(true);
  });
});
