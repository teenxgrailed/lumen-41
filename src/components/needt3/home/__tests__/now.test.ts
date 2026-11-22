import type { V3Event, V3Task } from "@/lib/needt3/map";

import { clockAt } from "../../phone/home/clock";
import { type ScheduleItem, chronological, scheduleItems } from "../derive";
import {
  eventSkipKey,
  missedLabel,
  missedToday,
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
      pickNow({ ...base, schedule: [], dayOpen: [], nowHour: 9 })
    ).toBeNull();
  });

  it("prefers the timed thing running right now, event or task", () => {
    const t = placed(9, { estimatedMinutes: 60 });
    const p = pickNow({
      ...base,
      schedule: [item(t, 9, 60), item(null, 11, 30, "Standup")],
      dayOpen: [t],
      nowHour: 9.5,
    });
    expect(p?.kind).toBe("now");
    expect(p?.task?.id).toBe(t.id);
    const e = pickNow({
      ...base,
      schedule: [item(null, 9, 60, "Dentist")],
      dayOpen: [],
      nowHour: 9.25,
    });
    expect(e?.kind).toBe("now");
    expect(e?.event?.title).toBe("Dentist");
    expect(e?.task).toBeNull();
    expect(e?.canSkip).toBe(false);
  });

  it("an event starting within 15 minutes is next, ahead of the task in the current slot", () => {
    const t = placed(10, { estimatedMinutes: 60 });
    const p = pickNow({
      ...base,
      schedule: [item(t, 10, 60), item(null, 10.75, 30, "Lunch")],
      dayOpen: [t],
      nowHour: 10.5 + 1 / 60, // 10:31, the task is running, lunch in 14 min
    });
    expect(p?.kind).toBe("next");
    expect(p?.event?.title).toBe("Lunch");
    expect(nowKicker(p!)).toBe("Next · 10:45");
  });

  it("an event 16 minutes away does not outrank the task in the current slot", () => {
    const t = placed(10, { estimatedMinutes: 60 });
    const p = pickNow({
      ...base,
      schedule: [item(t, 10, 60), item(null, 10.75, 30, "Lunch")],
      dayOpen: [t],
      nowHour: 10.75 - 16 / 60, // 10:29
    });
    expect(p?.kind).toBe("now");
    expect(p?.task?.id).toBe(t.id);
  });

  it("the 14:55 case: Team sync at 15:00 beats an overdue task", () => {
    // the overdue one is not even offered to the card: pickNow has no door for it
    const overdueFromThursday = task({ dueDate: "2026-11-12" });
    const p = pickNow({
      ...base,
      schedule: [item(null, 15, 30, "Team sync")],
      dayOpen: [],
      nowHour: 14 + 55 / 60,
    });
    expect(overdueFromThursday.done).toBe(false);
    expect(p?.event?.title).toBe("Team sync");
    expect(p?.kind).toBe("next");
  });

  it("an overdue task from a past day never takes the card", () => {
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [],
      nowHour: 10,
    });
    expect(p).toBeNull();
  });

  it("the next scheduled item is the nearest timed TASK; a later event does not outrank it", () => {
    const t = placed(16);
    const event = item(null, 13, 60, "Workshop");
    const p = pickNow({
      ...base,
      schedule: [event, item(t, 16)],
      dayOpen: [t],
      nowHour: 10,
    });
    expect(p?.kind).toBe("next");
    expect(p?.task?.id).toBe(t.id);
    expect(nowKicker(p!)).toBe("Next · 16:00");
  });

  it("an evening event does not outrank untimed tasks; it is the pick only when no task is open", () => {
    const anytime = task();
    const dinner = item(null, 20, 120, "Dinner");
    const withTask = pickNow({
      ...base,
      schedule: [dinner],
      dayOpen: [anytime],
      nowHour: 10,
    });
    expect(withTask?.task?.id).toBe(anytime.id);
    expect(withTask?.kind).toBe("anytime");
    const alone = pickNow({
      ...base,
      schedule: [dinner],
      dayOpen: [],
      nowHour: 10,
    });
    expect(alone?.event?.title).toBe("Dinner");
    expect(alone?.kind).toBe("next");
    // a passed task of today still comes before the later event
    const missed = placed(8);
    const q = pickNow({
      ...base,
      schedule: [item(missed, 8), dinner],
      dayOpen: [missed],
      nowHour: 10,
    });
    expect(q?.task?.id).toBe(missed.id);
  });

  it("a timed item ahead beats an open task with no hour", () => {
    const timed = placed(15);
    const anytime = task();
    const p = pickNow({
      ...base,
      schedule: [item(timed, 15)],
      dayOpen: [timed, anytime],
      nowHour: 10,
    });
    expect(p?.task?.id).toBe(timed.id);
    const withAnytime = pickNow({
      ...base,
      schedule: [],
      dayOpen: [anytime],
      nowHour: 10,
    });
    expect(withAnytime?.task?.id).toBe(anytime.id);
    expect(withAnytime?.kind).toBe("anytime");
  });

  it("a long event keeps the card while it runs, over open tasks", () => {
    const p = pickNow({
      ...base,
      schedule: [item(null, 9, 480, "Workshop")],
      dayOpen: [task()],
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
      nowHour: 10,
    });
    expect(p?.kind).toBe("anytime");
    expect(p?.task?.id).toBe(a.id);
    expect(p?.canSkip).toBe(true);
  });

  it("a passed-but-open task of today is the last resort", () => {
    const t = placed(8);
    const p = pickNow({
      ...base,
      schedule: [item(t, 8, 30)],
      dayOpen: [t],
      nowHour: 14,
    });
    expect(p?.kind).toBe("now");
    expect(p?.task?.id).toBe(t.id);
    // an open task with no hour comes before it
    const anytime = task();
    const q = pickNow({
      ...base,
      schedule: [item(t, 8, 30)],
      dayOpen: [t, anytime],
      nowHour: 14,
    });
    expect(q?.task?.id).toBe(anytime.id);
  });

  it("Skip moves a task pick on; an event is never skipped", () => {
    const a = task();
    const b = task();
    const p = pickNow({
      ...base,
      schedule: [],
      dayOpen: [a, b],
      nowHour: 10,
      skipped: [a.id],
    });
    expect(p?.task?.id).toBe(b.id);
    const e = pickNow({
      ...base,
      schedule: [item(null, 11, 30, "Call")],
      dayOpen: [],
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

  it("wins over a running event", () => {
    const p = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
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
      nowHour: 13,
      highlight: hl,
    })!;
    expect(first.skipKey).toBe(hl.id);
    const next = pickNow({
      ...base,
      schedule: [running],
      dayOpen: [hl],
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
      nowHour: 13,
      highlight: hl,
    });
    expect(p?.canSkip).toBe(false);
  });
});

describe("Skip keeps cycling", () => {
  it("two candidates skipped three times: the card alternates, it never sticks", () => {
    const a = task();
    const b = task();
    const input = {
      ...base,
      schedule: [],
      dayOpen: [a, b],
      nowHour: 10,
    };
    // the screens' onSkip: after a wrap the list starts again from this key
    let skipped: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = pickNow({ ...input, skipped })!;
      seen.push(p.task!.id);
      skipped = p.wrapped ? [p.skipKey] : [...skipped, p.skipKey];
    }
    expect(seen).toEqual([a.id, b.id, a.id, b.id]);
  });

  it("a highlight's Skip only counts events that can still be picked", () => {
    const hl2 = task({ scheduledStart: at(16) });
    const past = item(null, 8, 30, "Standup");
    const p = pickNow({
      ...base,
      schedule: [past],
      dayOpen: [hl2],
      nowHour: 13,
      highlight: hl2,
    });
    expect(p?.canSkip).toBe(false);
  });
});

describe("missedToday: the morning tasks that passed and are not done", () => {
  const auto = (h: number, over: Partial<V3Task> = {}) =>
    placed(h, { auto: true, ...over });
  const morning = auto(9, { estimatedMinutes: 30 });
  const running = auto(13, { estimatedMinutes: 60 });
  const later = auto(16);
  const anytime = task({ auto: true });
  const fixed = auto(8, { isFixed: true });
  const open = [morning, running, later, anytime, fixed];

  it("counts an auto-scheduled open task an hour after its slot ended, nothing else", () => {
    // 15:00: 09:00 task ended long ago; the 13:00 one ended at 14:00 (grace to 15:00)
    expect(missedToday(open, TODAY, 15).map((t) => t.id)).toEqual([
      morning.id,
      running.id,
    ]);
    expect(missedToday(open, TODAY, 14.9).map((t) => t.id)).toEqual([
      morning.id,
    ]);
  });

  it("14:00-14:30: not missed at 15:10, missed at 15:31", () => {
    const t = auto(14, { estimatedMinutes: 30 });
    expect(missedToday([t], TODAY, 15 + 10 / 60)).toHaveLength(0);
    expect(missedToday([t], TODAY, 15.5)).toHaveLength(1);
    expect(missedToday([t], TODAY, 15 + 31 / 60)).toHaveLength(1);
  });

  it("a placed task with no estimate is read as 30 minutes", () => {
    const t = auto(9);
    expect(missedToday([t], TODAY, 10.4)).toHaveLength(0);
    expect(missedToday([t], TODAY, 10.5)).toHaveLength(1);
  });

  it("a done, hand-placed, running or untimed task is never offered Reschedule", () => {
    expect(
      missedToday(
        [
          { ...morning, done: true } as V3Task,
          placed(9, { auto: false }),
          auto(9, { status: "in_progress" }),
          anytime,
        ],
        TODAY,
        20
      )
    ).toEqual([]);
  });

  it("a fixed-time task stays where it is, so it is not offered a new slot", () => {
    expect(missedToday([fixed], TODAY, 20)).toEqual([]);
  });

  it("says N tasks from earlier today", () => {
    expect(missedLabel(1)).toBe("1 task from earlier today");
    expect(missedLabel(3)).toBe("3 tasks from earlier today");
  });
});

describe("a long running event does not hide one that starts soon", () => {
  it("conference 9-17 running, meeting at 14:05, now 13:55: the meeting wins", () => {
    const p = pickNow({
      ...base,
      schedule: [
        item(null, 9, 480, "Conference"),
        item(null, 14 + 5 / 60, 30, "Meeting"),
      ],
      dayOpen: [],
      nowHour: 13 + 55 / 60,
    });
    expect(p?.event?.title).toBe("Meeting");
    expect(p?.kind).toBe("next");
  });

  it("with no event starting soon, the running one that began last wins", () => {
    const p = pickNow({
      ...base,
      schedule: [
        item(null, 9, 480, "Conference"),
        item(null, 13, 120, "Workshop"),
      ],
      dayOpen: [],
      nowHour: 13.5,
    });
    expect(p?.event?.title).toBe("Workshop");
  });
});

describe("chronological: one list, one Anytime row", () => {
  it("joins Morning, Afternoon and Evening in order and keeps Anytime apart", () => {
    const m = placed(9);
    const a = placed(14);
    const e = placed(19);
    const x = task();
    const out = chronological<V3Task>([
      ["Morning", [m]],
      ["Afternoon", [a]],
      ["Evening", [e]],
      ["Anytime today", [x]],
    ]);
    expect(out.timed.map((t) => t.id)).toEqual([m.id, a.id, e.id]);
    expect(out.anytime.map((t) => t.id)).toEqual([x.id]);
  });

  it("knows the phone's name for it too, and an empty day", () => {
    const x = task();
    expect(
      chronological<V3Task>([["Anytime", [x]]]).anytime.map((t) => t.id)
    ).toEqual([x.id]);
    expect(chronological<V3Task>([])).toEqual({ timed: [], anytime: [] });
  });
});
