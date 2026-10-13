/**
 * The phone Habits screen's rules, pure (phone-habits.jsx PhbHabits,
 * PhbTodayRow, PhbMonths, PhbLeft). Data and derivations are the desktop's:
 * checkins, streaks, the Free count and the time-left dots come from
 * `@/lib/needt3/derive` and `components/needt3/habits/derive`, never copied.
 */
import { formatInTimeZone } from "@/lib/date-utils";
import {
  type Checkin,
  addDays,
  daysBetween,
  habitDays,
  habitDoneOn,
  habitKept,
  habitStreak,
  habitWeek,
  weekday,
} from "@/lib/needt3/derive";
import { proLimitFull, proLimitText } from "@/lib/needt3/paywall";

import {
  FREE_HABITS,
  HABIT_WINDOW,
  habitGate,
  normTime,
  timeOk,
} from "../../habits/derive";

export { FREE_HABITS, HABIT_WINDOW, normTime, timeOk };

const MONTHS = [
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
];
const MONTHS_LONG = [
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
];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "11 Oct" from "2026-10-11". */
export function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`.trim();
}

/** "Sunday, 11 October" from the person's today ("2026-10-11"). */
export function dayLine(day: string) {
  const [, m, d] = day.split("-");
  return `${WEEKDAYS[weekday(day)]}, ${Number(d)} ${MONTHS_LONG[Number(m) - 1]}`;
}

/** "Kept today" / "Week done" / "Not yet today" (PhbTodayRow). */
export function todayStatus(on: boolean, rest: boolean) {
  return on ? "Kept today" : rest ? "Week done" : "Not yet today";
}

export interface PhoneHabitRow {
  on: boolean;
  /** A perWeek habit whose week is met and is not kept today: not due. */
  rest: boolean;
  /** "Kept today · 10 of 14" or "Not yet today · 2/3 this week". */
  meta: string;
  /** What a screen reader hears on the ring, and what pressing does. */
  say: string;
}

/** One check-in row (PhbTodayRow): the status and one quiet count. */
export function phoneHabitRow(
  h: { id: string; title: string; schedule: { perWeek: number | null } },
  checkins: readonly Checkin[],
  today: string
): PhoneHabitRow {
  const on = habitDoneOn(h.id, today, checkins);
  const perWeek = h.schedule.perWeek;
  const week = habitWeek(h.id, checkins, today);
  const rest = !!perWeek && !on && week >= perWeek;
  const count = perWeek
    ? `${week}/${perWeek} this week`
    : `${habitKept(h.id, checkins, today, HABIT_WINDOW)} of ${HABIT_WINDOW}`;
  return {
    on,
    rest,
    meta: `${todayStatus(on, rest)} · ${count}`,
    say: `${h.title}${on ? " — kept today, tap to undo" : " — mark kept today"}`,
  };
}

/** How many habits are kept today, of the live list. */
export function keptToday(
  list: readonly { id: string }[],
  checkins: readonly Checkin[],
  today: string
) {
  return list.filter((h) => habitDoneOn(h.id, today, checkins)).length;
}

export interface HistoryDot {
  day: string;
  kind: "on" | "miss";
  today: boolean;
  /** "9 Oct · kept". */
  label: string;
}

/**
 * The habit's last fourteen days as dots, oldest first, today last (PhbMonths).
 * The API returns only the fourteen-day strip, so this is the whole history
 * there is; the prototype's four months of dots are not drawn.
 */
export function historyDots(
  habitId: string,
  checkins: readonly Checkin[],
  today: string
): HistoryDot[] {
  const days = habitDays(habitId, checkins, today, HABIT_WINDOW);
  return days.map((d, i) => {
    const day = addDays(today, i - (days.length - 1));
    const isToday = i === days.length - 1;
    return {
      day,
      kind: d ? "on" : "miss",
      today: isToday,
      label: `${shortDay(day)} · ${d ? "kept" : "missed"}`,
    };
  });
}

/** The streak as it should be drawn: "14+" when it fills the window we can see. */
export function streakFigure(
  habitId: string,
  checkins: readonly Checkin[],
  today: string
) {
  const n = habitStreak(habitId, checkins, today);
  return { n, text: n >= HABIT_WINDOW ? `${n}+` : String(n) };
}

export function streakLabel(n: number) {
  return `${n} ${n === 1 ? "day" : "days"} in a row`;
}

/** "Time left" inputs from the person's clock: the year, its day, the hour. */
export function clockFacts(now: Date | string | number, tz: string) {
  const day = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const year = Number(day.slice(0, 4));
  return {
    year,
    dayOfYear: daysBetween(`${year}-01-01`, day),
    hour: Number(formatInTimeZone(now, tz, "H")),
    minute: Number(formatInTimeZone(now, tz, "m")),
  };
}

export interface HabitQuota {
  /** Free keeps FREE_HABITS; null on Pro, a trial, or while the plan loads. */
  max: number | null;
  used: number;
  /** "2 of 3 habits"; null off Free. */
  text: string | null;
  /** The Free allowance is used up: a new habit goes to the paywall. */
  atLimit: boolean;
  /** Show the "Upgrade for more" link. */
  full: boolean;
}

/**
 * The Free habit allowance, from the one rule the desktop screen uses
 * (`habitGate`, `FREE_HABITS`) and the prototype's ProLimit wording
 * (`proLimitText`). An unknown plan (still loading, or the request failed)
 * gates nothing, as on the desktop: nothing is blocked on a guess.
 */
export function habitQuota(
  planKind: string | null | undefined,
  count: number
): HabitQuota {
  const gate = habitGate(planKind, count);
  if (gate.max === null)
    return { max: null, used: count, text: null, atLimit: false, full: false };
  const facts = { used: gate.used, max: gate.max, noun: "habits" };
  return {
    max: gate.max,
    used: gate.used,
    text: proLimitText(facts),
    atLimit: gate.atLimit,
    full: proLimitFull(facts),
  };
}

/** The line the paywall names when a new habit is blocked ("Unlock … with Pro"). */
export const HABITS_PAYWALL_FEATURE = `more than ${FREE_HABITS} habits`;

export interface HabitForm {
  /** null = a new habit. */
  editId: string | null;
  title: string;
  time: string;
  perWeek: number | null;
  projectId: string | null;
}

export const BLANK_HABIT_FORM: HabitForm = {
  editId: null,
  title: "",
  time: "",
  perWeek: null,
  projectId: null,
};

export function formFromHabit(h: {
  id: string;
  title: string;
  projectId: string | null;
  schedule: { time: string | null; perWeek: number | null };
}): HabitForm {
  return {
    editId: h.id,
    title: h.title,
    time: h.schedule.time ?? "",
    perWeek: h.schedule.perWeek,
    projectId: h.projectId,
  };
}

export interface HabitFormCheck {
  ok: boolean;
  timeOk: boolean;
  /** Shown under the time field; null when the time is fine. */
  timeError: string | null;
}

export const TIME_ERROR = "Use 24-hour time, like 08:30.";

export function checkHabitForm(f: HabitForm): HabitFormCheck {
  const atOk = timeOk(f.time);
  return {
    ok: !!f.title.trim() && atOk,
    timeOk: atOk,
    timeError: atOk ? null : TIME_ERROR,
  };
}

/** The fields a save writes (PhbNewSheet.save), trimmed and normalised. */
export function formFields(f: HabitForm) {
  return {
    title: f.title.trim(),
    projectId: f.projectId,
    schedule: { time: normTime(f.time), perWeek: f.perWeek },
  };
}

/** The habits matching a pull-down query, at most five (PhbHabits.pull). */
export function searchHabits<H extends { title: string }>(
  list: readonly H[],
  q: string
) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return list.filter((h) => h.title.toLowerCase().includes(s)).slice(0, 5);
}
