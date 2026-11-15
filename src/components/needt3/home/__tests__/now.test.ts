import type { V3Event, V3Task } from "@/lib/needt3/map";

import { clockAt } from "../../phone/home/clock";
import { type ScheduleItem, scheduleItems } from "../derive";
import {
  eventSkipKey,
  nowCardTime,
  nowKicker,
  overdueLabel,
  pickNow,
} from "../now";
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

  it("overdue beats an event that is more than an hour away", () => {
    const old = task({ dueDate: "2026-08-20" });
    const p = pickNow({
      ...base,
      schedule: [item(null, 20, 120, "Dinner")],
      dayOpen: [],
      lateOpen: [old],
      nowHour: 10,
    });
    expect(p?.kind).toBe("late");
    expect(p?.task?.id).toBe(old.id);
  });

  it("a later event is the pick only when nothing else is open", () => {
    const p = pickNow({
      ...base,
      schedule: [item(null, 20, 120, "Dinner")],
      dayOpen: [],
      lateOpen: [],
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
    expect(p?.canSkip).toBe(true);
  });

  it("Skip works on an event: the card moves to the next pick", () => {
    const t = task();
    const input = {
      ...base,
      schedule: [item(null, 9, 480, "Workshop")],
      dayOpen: [t],
      lateOpen: [],
      nowHour: 13,
    };
    const first = pickNow(input)!;
    expect(first.event?.title).toBe("Workshop");
    expect(first.skipKey).toBe(eventSkipKey(TODAY, first.event!.key));
    const next = pickNow({ ...input, skipped: [first.skipKey] });
    expect(next?.task?.id).toBe(t.id);
    // skipping the last candidate starts again instead of leaving no card
    const wrapped = pickNow({
      ...input,
      dayOpen: [],
      skipped: [first.skipKey],
    });
    expect(wrapped?.event?.title).toBe("Workshop");
  });

  it("an event alone cannot be skipped (nowhere to go)", () => {
    const p = pickNow({
      ...base,
      schedule: [item(null, 9, 60, "Call")],
      dayOpen: [],
      lateOpen: [],
      nowHour: 9.5,
    });
    expect(p?.canSkip).toBe(false);
  });

  it("an event skipped yesterday does not stay skipped today", () => {
    const e = item(null, 9, 60, "Call");
    const p = pickNow({
      ...base,
      schedule: [e],
      dayOpen: [],
      lateOpen: [],
      nowHour: 9.5,
      skipped: [eventSkipKey("2026-08-31", e.key)],
    });
    expect(p?.event?.title).toBe("Call");
  });

  it("an event running past midnight is now before midnight", () => {
    const p = pickNow({
      ...base,
      schedule: [item(null, 23, 180, "Night shift")],
      dayOpen: [],
      lateOpen: [],
      nowHour: 23.5,
    });
    expect(p?.kind).toBe("now");
  });

  it("an event from 22:00 yesterday to 02:00 today is not in today's schedule, so the task is the pick", () => {
    const night = {
      id: "n1",
      title: "Night shift",
      startAt: "2026-08-31T22:00",
      endAt: `${TODAY}T02:00`,
      isAllDay: false,
      calendarId: "c1",
      source: "needt",
      externalId: null,
    } as unknown as V3Event;
    const t = task();
    const schedule = scheduleItems([t], [night], TODAY);
    expect(schedule.some((x) => x.event)).toBe(false);
    const p = pickNow({
      ...base,
      schedule,
      dayOpen: [t],
      lateOpen: [],
      nowHour: 0.5,
    });
    expect(p?.task?.id).toBe(t.id);
    expect(p?.kind).toBe("anytime");
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

describe("the Now clock is the person's zone, the same one the schedule panel uses", () => {
  // 15:10 in Zurich (CET, UTC+1) is 14:10 UTC
  const instant = new Date("2026-11-15T14:10:00Z");
  const day = "2026-11-15";
  const at2 = (h: number, m = 0) =>
    `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const review = task({
    title: "Review the launch checklist",
    dueDate: day,
    scheduledStart: at2(14),
    estimatedMinutes: 30,
  });
  const sync = {
    id: "ev1",
    title: "Team sync",
    startAt: at2(15),
    endAt: at2(15, 30),
    isAllDay: false,
    calendarId: "c1",
    source: "needt",
    externalId: null,
  } as unknown as V3Event;
  const run = (tz: string) => {
    const { today, hour } = clockAt(instant, tz);
    return pickNow({
      today,
      schedule: scheduleItems([review], [sync], today),
      dayOpen: [review],
      lateOpen: [],
      nowHour: hour,
      skipped: [],
    });
  };

  it("Europe/Zurich: it is 15:10, the running event wins and the 14:00 task is not Now", () => {
    expect(clockAt(instant, "Europe/Zurich").hour).toBeCloseTo(15.1667, 3);
    const p = run("Europe/Zurich");
    expect(p?.kind).toBe("now");
    expect(p?.event?.title).toBe("Team sync");
  });

  it("UTC: the same instant is 14:10, so the 14:00 task is the one running", () => {
    expect(clockAt(instant, "UTC").hour).toBeCloseTo(14.1667, 3);
    const p = run("UTC");
    expect(p?.kind).toBe("now");
    expect(p?.task?.title).toBe("Review the launch checklist");
  });
});

describe("the day's highlight is the Now card", () => {
  const hl = task({ title: "The one thing", scheduledStart: at(16) });
  const running = item(null, 9, 480, "Workshop");
  const old = task({ dueDate: "2026-08-20" });

  it("wins over a running event and over overdue", () => {
    const p = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
      lateOpen: [old],
      nowHour: 13,
      highlight: hl,
    });
    expect(p?.kind).toBe("highlight");
    expect(p?.task?.id).toBe(hl.id);
    expect(p?.at).toBe(16);
    expect(nowKicker(p!)).toBe("Highlight");
    expect(p?.canSkip).toBe(true);
  });

  it("a done highlight falls through to the normal order", () => {
    const done = { ...hl, done: true } as V3Task;
    const p = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [],
      lateOpen: [old],
      nowHour: 13,
      highlight: done,
    });
    expect(p?.kind).toBe("now");
    expect(p?.event?.title).toBe("Workshop");
  });

  it("no highlight: the order is unchanged", () => {
    const p = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
      lateOpen: [],
      nowHour: 13,
      highlight: null,
    });
    expect(p?.event?.title).toBe("Workshop");
  });

  it("Skip falls through to the normal order", () => {
    const first = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
      lateOpen: [old],
      nowHour: 13,
      highlight: hl,
    })!;
    expect(first.skipKey).toBe(hl.id);
    const next = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
      lateOpen: [old],
      nowHour: 13,
      highlight: hl,
      skipped: [first.skipKey],
    });
    expect(next?.event?.title).toBe("Workshop");
  });

  it("a highlight alone cannot be skipped", () => {
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [hl],
      lateOpen: [],
      nowHour: 13,
      highlight: hl,
    });
    expect(p?.canSkip).toBe(false);
  });
});
