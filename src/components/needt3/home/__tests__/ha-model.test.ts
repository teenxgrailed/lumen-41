import type { Stats } from "@/services/stats/home-stats";

import type { Checkin } from "@/lib/needt3/derive";
import type { Weather } from "@/lib/needt3/hooks/weather";
import type { V3Habit } from "@/lib/needt3/map";

import {
  briefLines,
  haBandOf,
  haHabitsOf,
  haScheduleRows,
  haTaskCard,
  haTimeOf,
  haWeatherOf,
  haWeekOf,
  habitEmoji,
  weatherEmoji,
} from "../ha/model";
import { TODAY, task } from "./fixtures";

const habit = (over: Partial<V3Habit> = {}): V3Habit => ({
  id: "h1",
  title: "Lift",
  projectId: null,
  color: null,
  icon: null,
  schedule: { time: null, perWeek: null },
  archivedAt: null,
  ...over,
});
const kept = (habitId: string, date: string): Checkin => ({
  habitId,
  date,
  done: true,
});

describe("habitEmoji", () => {
  it("takes the emoji of Habit.icon, nothing else", () => {
    expect(habitEmoji("🦉")).toBe("🦉");
    expect(habitEmoji("🏋️ lift")).toMatch(/^🏋/u);
    expect(habitEmoji("owl")).toBe("");
    expect(habitEmoji(null)).toBe("");
  });
});

describe("haHabitsOf", () => {
  it("makes a habit weekly only when its target is under seven", () => {
    const list = haHabitsOf(
      [
        habit({ id: "d", title: "Duolingo", icon: "🦉" }),
        habit({ id: "w", schedule: { time: null, perWeek: 3 } }),
        habit({ id: "e", schedule: { time: null, perWeek: 7 } }),
      ],
      [kept("w", "2026-08-31"), kept("w", TODAY), kept("d", TODAY)],
      TODAY
    );
    expect(list[0]).toEqual({
      id: "d",
      name: "Duolingo",
      emoji: "🦉",
      kind: "daily",
      done: true,
    });
    expect(list[1]).toMatchObject({
      kind: "week",
      target: 3,
      count: 2,
      done: true,
    });
    expect(list[2]).toMatchObject({ kind: "daily", done: false });
  });
  it("never counts past the target, and skips archived habits", () => {
    const week = ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-30"].map(
      (d) => kept("w", d)
    );
    const list = haHabitsOf(
      [
        habit({ id: "w", schedule: { time: null, perWeek: 2 } }),
        habit({ id: "x", archivedAt: "2026-08-01" }),
      ],
      week,
      TODAY
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ target: 2, count: 2 });
  });
});

describe("weather", () => {
  const w: Weather = {
    city: "Zurich",
    temp: 12,
    min: 8,
    max: 14,
    code: 61,
    summary: "Light rain",
  };
  it("maps a WMO code to a sky", () => {
    expect(weatherEmoji(0)).toBe("☀️");
    expect(weatherEmoji(61)).toBe("🌧");
    expect(weatherEmoji(95)).toBe("⛈");
  });
  it("is hidden without a city, whatever else is known", () => {
    expect(
      haWeatherOf({ city: " ", weather: w, first: { title: "x", at: "10:00" } })
    ).toBeNull();
  });
  it("shows the weather and the first event, and never a leave-by", () => {
    const wx = haWeatherOf({
      city: "Zurich",
      weather: w,
      first: { title: "Planning", at: "10:00" },
    });
    expect(wx).toEqual({
      ic: "🌧",
      t: "12°",
      d: "light rain",
      first: "10:00",
    });
    expect(JSON.stringify(wx)).not.toMatch(/leave/i);
  });
  it("keeps whichever half there is, and is null with neither", () => {
    expect(
      haWeatherOf({
        city: "Z",
        weather: null,
        first: { title: "x", at: "9:00" },
      })
    ).toEqual({ first: "9:00" });
    expect(haWeatherOf({ city: "Z", weather: w, first: null })).toMatchObject({
      t: "12°",
    });
    expect(haWeatherOf({ city: "Z", weather: null, first: null })).toBeNull();
  });
});

describe("haTimeOf", () => {
  const left = (over = {}) => ({
    planned: 180,
    free: 300,
    fill: 0.6,
    over: false,
    overBy: 0,
    ...over,
  });
  it("lays the day out: done, still planned, now", () => {
    const t = haTimeOf({ left: left(), nowHour: 11, start: 9, end: 18 });
    expect(t).toMatchObject({ planned: "3 h", free: "2 h" });
    expect(t?.used).toBeCloseTo(2 / 9);
    expect(t?.plan).toBeCloseTo(180 / 540);
    expect(t?.over).toBeUndefined();
  });
  it("says how much it is overbooked by and when the day ends", () => {
    const t = haTimeOf({
      left: left({ planned: 300, free: 260, over: true, overBy: 40 }),
      nowHour: 14,
      start: 9,
      end: 18,
    });
    expect(t?.over).toEqual({ by: "40 min", ends: "18:00" });
    expect(t?.free).toBeUndefined();
    expect((t?.used ?? 0) + (t?.plan ?? 0)).toBeCloseTo(1);
  });
  it("is null when there is nothing to compare", () => {
    expect(haTimeOf({ left: null, nowHour: 10, start: 9, end: 18 })).toBeNull();
    expect(
      haTimeOf({ left: left(), nowHour: 10, start: 9, end: 9 })
    ).toBeNull();
  });
});

describe("briefLines and haTaskCard", () => {
  it("splits the brief into its lines", () => {
    expect(briefLines("One.\n\n  Two. \n")).toEqual(["One.", "Two."]);
    expect(briefLines(null)).toEqual([]);
  });
  it("gives the card the task's hour and length when it has them", () => {
    const t = task({
      title: "Plan",
      scheduledStart: `${TODAY}T11:00`,
      estimatedMinutes: 60,
    });
    expect(haTaskCard(t, TODAY, "why")).toEqual({
      id: t.id,
      title: "Plan",
      time: "11:00",
      dur: "1 h",
      sub: "why",
    });
    const bare = haTaskCard(
      task({ scheduledStart: null, estimatedMinutes: null }),
      TODAY,
      "x"
    );
    expect(bare.time).toBeUndefined();
    expect(bare.dur).toBeUndefined();
  });
});

describe("haWeekOf", () => {
  // Thursday 22 October 2026; the week runs Monday 19 to Sunday 25
  const NOW = "2026-10-22";
  const stats = (over: Partial<Stats> = {}): Stats => ({
    range: "week",
    from: "2026-10-16",
    to: NOW,
    timeZone: "Europe/Zurich",
    total: 11,
    days: [
      { date: "2026-10-18", done: 9, focusMinutes: 0 },
      { date: "2026-10-19", done: 2, focusMinutes: 0 },
      { date: "2026-10-20", done: 5, focusMinutes: 0 },
      { date: "2026-10-21", done: 0, focusMinutes: 0 },
      { date: NOW, done: 4, focusMinutes: 0 },
    ],
    bestDay: "2026-10-18",
    byProject: [],
    byWeekday: [],
    bestWeekday: null,
    focusMinutes: null,
    focusSessions: 0,
    ...over,
  });
  it("is the calendar week of today: bars against the busiest day, today marked", () => {
    const w = haWeekOf({
      stats: stats(),
      today: NOW,
      startDay: "monday",
      streak: 3,
    });
    expect(w).toMatchObject({
      done: 11,
      today: 3,
      streak: 3,
      best: "Tue · 5",
      labels: ["M", "T", "W", "T", "F", "S", "S"],
    });
    expect(w?.bars).toEqual([2 / 5, 1, 0, 4 / 5, 0, 0, 0]);
  });
  it("starts on Sunday when the person does", () => {
    const w = haWeekOf({
      stats: stats(),
      today: NOW,
      startDay: "sunday",
      streak: 0,
    });
    expect(w?.labels[0]).toBe("S");
    expect(w?.today).toBe(4);
    expect(w?.done).toBe(20);
  });
  it("is null with nothing to show", () => {
    expect(
      haWeekOf({ stats: undefined, today: NOW, startDay: "monday", streak: 4 })
    ).toBeNull();
    expect(
      haWeekOf({
        stats: stats({ total: 0, days: [] }),
        today: NOW,
        startDay: "monday",
        streak: 0,
      })
    ).toBeNull();
  });
});

describe("the day's timeline", () => {
  const band = (over = {}) => ({
    key: "b1",
    blockId: "b1",
    kind: "lunch",
    title: "Lunch",
    emoji: "🍽",
    tone: "info" as const,
    date: TODAY,
    from: 12.5,
    to: 13.25,
    repeating: false,
    linked: false,
    ...over,
  });
  const item = (over = {}) => ({
    key: "i1",
    id: "t1",
    at: 10,
    len: 60,
    title: "Write report",
    event: false,
    done: false,
    projectId: null,
    ...over,
  });
  it("draws a personal block as a band in a palette colour, never a raw one", () => {
    expect(haBandOf(band())).toEqual({
      e: "🍽",
      n: "Lunch",
      time: "12:30–13:15",
      hue: "var(--info)",
    });
    expect(haBandOf(band({ tone: "neutral" })).hue).toBe(
      "var(--text-tertiary)"
    );
  });
  it("puts tasks, events and bands in one run by hour, the now line above the next", () => {
    const rows = haScheduleRows({
      items: [
        item({ at: 14, key: "late" }),
        item({ at: 9, key: "early", event: true }),
      ],
      bands: [band()],
      nowHour: 11,
      hueOf: () => "red",
    });
    expect(rows.map((r) => r.key)).toEqual(["early", "band:b1", "late"]);
    expect(rows.map((r) => !!r.now)).toEqual([false, true, false]);
    expect(rows[0]?.task).toMatchObject({ event: true, past: true });
    expect(rows[1]?.band?.n).toBe("Lunch");
    expect(rows[2]?.task?.c).toBe("red");
  });
  it("leaves the now line alone at the end when the day is past every row", () => {
    const rows = haScheduleRows({
      items: [item({ at: 9 })],
      bands: [],
      nowHour: 18,
      hueOf: () => "red",
    });
    expect(rows.at(-1)).toMatchObject({ now: true, bare: true, t: "18:00" });
  });
  it("is empty for an empty day", () => {
    expect(
      haScheduleRows({ items: [], bands: [], nowHour: 9, hueOf: () => "" })
    ).toEqual([]);
  });
});
