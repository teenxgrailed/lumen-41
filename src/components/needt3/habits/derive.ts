/**
 * Habit card and screen derivations (Habits.jsx, places.jsx HabitsScreen),
 * pure so they are tested apart from the screen. Owner, 2026-10-09: habits
 * keep streaks.
 */
import {
  type Checkin,
  daysBetween,
  habitDays,
  habitDoneOn,
  habitKept,
  habitStreak,
  habitWeek,
} from "@/lib/needt3/derive";
import { PLAN_LIMITS } from "@/lib/plan-limits";

/**
 * How many days back the checkins reach. `useCheckins` reads the
 * fourteen-day strip from `/api/needt/today`; a streak that fills the whole
 * window may be longer than we can see.
 */
export const HABIT_WINDOW = 14;

/**
 * Free's active-habit limit, read from the plan table the API enforces
 * (`canCreateHabit` in `@/lib/entitlements`); never a local constant.
 */
export const FREE_HABITS: number = PLAN_LIMITS.FREE.habits;

export const PER_WEEK_CHOICES: readonly [number | null, string][] = [
  [null, "Every day"],
  [3, "3× a week"],
  [5, "5× a week"],
];

export interface HabitCard {
  on: boolean;
  /** A perWeek habit whose week is met and is not kept today: not due. */
  rest: boolean;
  days: (0 | 1)[];
  streak: number;
  status: "Kept today" | "Week done" | "Not yet today";
  /** "10 of 14", or "2/3 this week", plus " · 5 in a row" from two days. */
  label: string;
  /** What a screen reader hears, and what pressing does. */
  say: string;
}

/** "5 in a row", or "14+ in a row" when the streak fills the known window. */
export function streakText(streak: number, window = HABIT_WINDOW) {
  if (streak < 2) return "";
  return `${streak}${streak >= window ? "+" : ""} in a row`;
}

export function habitCard(
  h: { id: string; title: string; schedule: { perWeek: number | null } },
  checkins: readonly Checkin[],
  today: string
): HabitCard {
  const on = habitDoneOn(h.id, today, checkins);
  const days = habitDays(h.id, checkins, today, HABIT_WINDOW);
  const hit = habitKept(h.id, checkins, today, HABIT_WINDOW);
  const perWeek = h.schedule.perWeek;
  const week = habitWeek(h.id, checkins, today);
  const streak = habitStreak(h.id, checkins, today);
  const rest = !!perWeek && !on && week >= perWeek;
  const base = perWeek
    ? `${week}/${perWeek} this week`
    : `${hit} of ${HABIT_WINDOW}`;
  const run = streakText(streak);
  return {
    on,
    rest,
    days,
    streak,
    status: on ? "Kept today" : rest ? "Week done" : "Not yet today",
    label: run ? `${base} · ${run}` : base,
    say:
      h.title +
      (on
        ? " — kept today, press to undo"
        : rest
          ? " — week done, press to mark it kept anyway"
          : " — press to mark it kept today"),
  };
}

/** Many habits: the first twelve, then "Show all N" (more than CAP + 2). */
export function capHabits<H>(list: readonly H[], all: boolean, cap = 12) {
  const over = list.length > cap + 2;
  return { over, shown: over && !all ? list.slice(0, cap) : list.slice() };
}

/** The free plan's gate on a new habit. */
export function habitGate(planKind: string | null | undefined, count: number) {
  const free = planKind === "free";
  return {
    atLimit: free && count >= FREE_HABITS,
    used: count,
    max: free ? FREE_HABITS : null,
  };
}

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Empty, or a 24-hour "H:MM" / "HH:MM". */
export function timeOk(v: string) {
  const t = v.trim();
  return !t || TIME.test(t);
}

/** "8:05" → "08:05"; empty → null. Call only on a `timeOk` value. */
export function normTime(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * Time left (Habits.jsx HabitLeft): hours left today (a dot an hour) and
 * days left in the year (a dot a day), from the person's local clock.
 */
export function timeLeft(local: {
  year: number;
  dayOfYear: number;
  hour: number;
  minute: number;
}) {
  const { year, dayOfYear, hour, minute } = local;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const len = leap ? 366 : 365;
  const hoursLeft = 24 - hour - (minute > 0 ? 1 : 0);
  const hours = Array.from({ length: 24 }, (_, i) =>
    i < hour ? "spent" : i === hour ? "now" : "open"
  );
  const days = Array.from({ length: len }, (_, i) =>
    i < dayOfYear ? "spent" : i === dayOfYear ? "now" : "open"
  );
  return { hoursLeft, daysLeft: len - dayOfYear - 1, hours, days };
}

/* ---------- last four months (Habits.jsx HabitMonths) ---------- */

/** "Last four months": this month and the three before it. The history route's 124 days always cover them (3 × 31 + 31). */
export const MONTHS_SHOWN = 4;

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface MonthDot {
  day: number;
  date: string;
  kind: "ahead" | "on" | "miss";
  /** Share of the shown habits kept that day, 0..1. */
  ratio: number;
  kept: number;
  today: boolean;
}

export interface MonthRow {
  /** "2026-09". */
  key: string;
  /** 0..11 */
  month: number;
  current: boolean;
  dots: MonthDot[];
}

function daysInMonth(year: number, month0: number) {
  if (month0 === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [3, 5, 8, 10].includes(month0) ? 30 : 31;
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * One row per month, the current one last: a dot a day, "ahead" past today,
 * "on" when any of `habitIds` was kept that day, otherwise "miss". `ratio` is
 * the share kept, which sets how strong the dot is.
 */
export function monthRows(
  today: string,
  habitIds: readonly string[],
  checkins: readonly Checkin[],
  months = MONTHS_SHOWN
): MonthRow[] {
  const year = Number(today.slice(0, 4));
  const month0 = Number(today.slice(5, 7)) - 1;
  const ids = new Set(habitIds);
  const kept = new Map<string, Set<string>>();
  for (const c of checkins) {
    if (!c.done || !ids.has(c.habitId)) continue;
    const set = kept.get(c.date) ?? new Set<string>();
    set.add(c.habitId);
    kept.set(c.date, set);
  }
  const rows: MonthRow[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const idx = year * 12 + month0 - k;
    const y = Math.floor(idx / 12);
    const m = idx - y * 12;
    const dots: MonthDot[] = [];
    for (let day = 1; day <= daysInMonth(y, m); day++) {
      const date = `${y}-${two(m + 1)}-${two(day)}`;
      const back = daysBetween(date, today);
      if (back < 0) {
        dots.push({
          day,
          date,
          kind: "ahead",
          ratio: 0,
          kept: 0,
          today: false,
        });
        continue;
      }
      const n = kept.get(date)?.size ?? 0;
      dots.push({
        day,
        date,
        kind: n > 0 ? "on" : "miss",
        ratio: ids.size ? n / ids.size : 0,
        kept: n,
        today: back === 0,
      });
    }
    rows.push({
      key: `${y}-${two(m + 1)}`,
      month: m,
      current: k === 0,
      dots,
    });
  }
  return rows;
}

/** Days this month with at least one habit kept ("1 active day in September"). */
export function activeDays(rows: readonly MonthRow[]) {
  const current = rows.find((r) => r.current);
  return current ? current.dots.filter((d) => d.kind === "on").length : 0;
}
