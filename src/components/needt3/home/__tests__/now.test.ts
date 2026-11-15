import type { V3Task } from "@/lib/needt3/map";

import type { ScheduleItem } from "../derive";
import { nowCardTime, nowKicker, overdueLabel, pickNow } from "../now";
import { TODAY, task } from "./fixtures";

const at = (h: number, m = 0) =>
  `${TODAY}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

/** A task placed at an hour today (the fixtures' `hourOn` reads scheduledStart). */
const placed = (h: number, over: Partial<V3Task> = {}) =>
  task({ scheduledStart: at(h), ...over });

const item = (
  t: V3Task | null,
  atHour: number,
  len = 30,
  title = "Event"
): ScheduleItem => ({
  key: t ? `t${t.id}` : `e${title}${atHour}`,
  id: t ? t.id : null,
  at: atHour,
  len,
  title: t ? t.title : title,
  event: !t,
  done: false,
  projectId: null,
});

const base = { today: TODAY, skipped: [] as string[] };

describe("pickNow: what the Now card shows", () => {
  it("is null on a day with nothing open", () => {
    expect(
      pickNow({ ...base, schedule: [], dayOpen: [], lateOpen: [], nowHour: 9 })
    ).toBeNull();
  });

  it("prefers the timed thing running right now, event or task", () => {
    const t = placed(9, { estimatedMinutes: 60 });
    const p = pickNow({
      ...base,
      schedule: [item(t, 9, 60), item(null, 11, 30, "Standup")],
      dayOpen: [t],
      lateOpen: [],
      nowHour: 9.5,
    });
    expect(p?.kind).toBe("now");
    expect(p?.task?.id).toBe(t.id);
    const e = pickNow({
      ...base,
      schedule: [item(null, 9, 60, "Dentist")],
      dayOpen: [],
      lateOpen: [],
      nowHour: 9.25,
    });
    expect(e?.kind).toBe("now");
    expect(e?.event?.title).toBe("Dentist");
    expect(e?.task).toBeNull();
    expect(e?.canSkip).toBe(false);
  });

  it("an event starting within the hour is next, ahead of a later task", () => {
    const t = placed(15);
    const p = pickNow({
      ...base,
      schedule: [item(null, 10.75, 30, "Lunch"), item(t, 15)],
      dayOpen: [t],
      lateOpen: [],
      nowHour: 10,
    });
    expect(p?.kind).toBe("next");
    expect(p?.event?.title).toBe("Lunch");
    expect(nowKicker(p!)).toBe("Next · 10:45");
  });

  it("a later (evening) event does not hide today's open tasks", () => {
    const timed = placed(15);
    const anytime = task();
    const dinner = item(null, 20, 120, "Dinner");
    const withTimed = pickNow({
      ...base,
      schedule: [item(timed, 15), dinner],
      dayOpen: [timed],
      lateOpen: [],
      nowHour: 10,
    });
    expect(withTimed?.task?.id).toBe(timed.id);
    const withAnytime = pickNow({
      ...base,
      schedule: [dinner],
      dayOpen: [anytime],
      lateOpen: [],
      nowHour: 10,
    });
    expect(withAnytime?.task?.id).toBe(anytime.id);
    expect(withAnytime?.kind).toBe("anytime");
  });

  it("the evening event is the pick once no open task of today is left", () => {
    const old = task({ dueDate: "2026-08-20" });
    const p = pickNow({
      ...base,
      schedule: [item(null, 20, 120, "Dinner")],
      dayOpen: [],
      lateOpen: [old],
      nowHour: 10,
    });
    expect(p?.event?.title).toBe("Dinner");
    expect(p?.kind).toBe("next");
  });

  it("a long event keeps the card while it runs, over open tasks", () => {
    const p = pickNow({
      ...base,
      schedule: [item(null, 9, 480, "Workshop")],
      dayOpen: [task()],
      lateOpen: [],
      nowHour: 13,
    });
    expect(p?.kind).toBe("now");
    expect(p?.event?.title).toBe("Workshop");
  });

  it("an event running past midnight is now before midnight; after it, it is not today's", () => {
    const before = pickNow({
      ...base,
      schedule: [item(null, 23, 180, "Night shift")],
      dayOpen: [],
      lateOpen: [],
      nowHour: 23.5,
    });
    expect(before?.kind).toBe("now");
    const t = task();
    const after = pickNow({
      ...base,
      schedule: [],
      dayOpen: [t],
      lateOpen: [],
      nowHour: 0.5,
    });
    expect(after?.task?.id).toBe(t.id);
  });

  it("the next-pick kicker carries the time, so the card does not repeat it", () => {
    expect(nowCardTime({ time: "13:00" }, "next").time).toBeUndefined();
    expect(nowCardTime({ time: "13:00" }, "now").time).toBe("13:00");
  });

  it("then today's first open task without an hour", () => {
    const a = task();
    const b = task();
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [a, b],
      lateOpen: [],
      nowHour: 10,
    });
    expect(p?.kind).toBe("anytime");
    expect(p?.task?.id).toBe(a.id);
    expect(p?.canSkip).toBe(true);
  });

  it("a passed-but-open task of today beats overdue", () => {
    const t = placed(8);
    const old = task({ dueDate: "2026-08-20" });
    const p = pickNow({
      ...base,
      schedule: [item(t, 8, 30)],
      dayOpen: [t],
      lateOpen: [old],
      nowHour: 14,
    });
    expect(p?.kind).toBe("now");
    expect(p?.task?.id).toBe(t.id);
  });

  it("overdue is picked only when nothing else is open, oldest first", () => {
    const o1 = task({ dueDate: "2026-08-20" });
    const o2 = task({ dueDate: "2026-08-25" });
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [],
      lateOpen: [o1, o2],
      nowHour: 10,
    });
    expect(p?.kind).toBe("late");
    expect(p?.task?.id).toBe(o1.id);
    expect(nowKicker(p!)).toBe("Overdue");
  });

  it("Skip moves a task pick on; an event is never skipped", () => {
    const a = task();
    const b = task();
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [a, b],
      lateOpen: [],
      nowHour: 10,
      skipped: [a.id],
    });
    expect(p?.task?.id).toBe(b.id);
    const e = pickNow({
      ...base,
      schedule: [item(null, 11, 30, "Call")],
      dayOpen: [],
      lateOpen: [],
      nowHour: 10,
      skipped: ["whatever"],
    });
    expect(e?.event?.title).toBe("Call");
  });

  it("a task not in today's open list (done) is never the pick", () => {
    const done = placed(9, { done: true });
    const p = pickNow({
      ...base,
      schedule: [item(done, 9, 60)],
      dayOpen: [],
      lateOpen: [],
      nowHour: 9.5,
    });
    expect(p).toBeNull();
  });
});

describe("the overdue row's label", () => {
  it("is the one count and one word", () => {
    expect(overdueLabel(1)).toBe("1 overdue");
    expect(overdueLabel(39)).toBe("39 overdue");
  });
});
