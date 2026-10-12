/**
 * The phone Calendar's rules (mobile-v2-plates.jsx `V2pCalendar`, `V2pWeek`,
 * `V2pMonth`), pure. What a day holds comes from the desktop calendar's own
 * `calendarItems` (tasks and events in one list, read-only flags and all);
 * what is here is how the phone reads one day of it: the plate, what is
 * coming, what is over, the overlap marks, the month grid. Nothing reads the
 * clock: `today` and `nowHour` are arguments.
 */
import { addDays, cvDur, dayLabel, daysBetween } from "@/lib/needt3/derive";

import type { CalItem, CalTimed } from "../../calendar/blocks";
import { c2Time, calDay, weekStart } from "../../calendar/layout";
import type { ScreenQuery } from "../../states/status";

export type CalView = "schedule" | "month";

export const LONG_MONTHS = [
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

const pad = (n: number) => String(n).padStart(2, "0");
const dim = (day: string) => {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return daysBetween(`${y}-${pad(m)}-01`, next);
};

/* ---------- the day ---------- */

/** A dot per planned item in the strip (0–3), as `v2pDayLoad` sizes the month's. */
export function dayLoad(n: number) {
  return n <= 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
}

/**
 * Timed items of one day that collide with a calendar event: id → titles of
 * the others. Two tasks overlapping each other are not marked — the scheduler
 * spreads them; only a clash that involves an event is the person's call
 * (owner, 2026-10-09).
 */
export function dayOverlaps(timed: readonly CalTimed[]): {
  clash: Record<string, string[]>;
  pairs: number;
} {
  const clash: Record<string, string[]> = {};
  let pairs = 0;
  timed.forEach((a, i) => {
    timed.forEach((b, j) => {
      if (i === j || !(a.event || b.event)) return;
      if (!(a.at < b.at + b.len / 60 && b.at < a.at + a.len / 60)) return;
      (clash[a.id] ??= []).push(b.title);
      if (i < j) pairs++;
    });
  });
  return { clash, pairs };
}

export interface DayPlan {
  isToday: boolean;
  isPast: boolean;
  timed: CalTimed[];
  allDay: CalItem[];
  clash: Record<string, string[]>;
  pairs: number;
  /** What is on now (today). */
  nowB: CalTimed | null;
  /** The card at the top: now, else next; a day ahead, its first item. */
  plate: CalTimed | null;
  /** On the plate: "until 15:00" / "in 40 min". */
  plateLine: string;
  /** Timeline rows after the plate that have not ended. */
  coming: CalTimed[];
  /** Today's rows that have ended. */
  earlier: CalTimed[];
  /** Where the now line goes among `coming`; -1 = after them (today only). */
  nowAt: number;
  /** Minutes booked in timed items. */
  booked: number;
}

/** One day of the calendar, read the way the phone draws it. */
export function dayPlan(
  timedAll: readonly CalTimed[],
  looseAll: readonly CalItem[],
  day: string,
  today: string,
  nowHour: number
): DayPlan {
  const isToday = day === today;
  const isPast = day < today;
  const timed = timedAll
    .filter((b) => b.date === day)
    .sort((a, b) => a.at - b.at);
  const allDay = looseAll.filter((b) => b.date === day);
  const { clash, pairs } = dayOverlaps(timed);
  const end = (b: CalTimed) => b.at + b.len / 60;
  const ended = (b: CalTimed) => isToday && end(b) <= nowHour;
  const nowB = isToday
    ? (timed.find((b) => b.at <= nowHour && end(b) > nowHour) ?? null)
    : null;
  const nextB = isToday ? (timed.find((b) => b.at > nowHour) ?? null) : null;
  const plate = isToday ? (nowB ?? nextB) : !isPast ? (timed[0] ?? null) : null;
  const rest = timed.filter((b) => b !== plate);
  const coming = rest.filter((b) => !ended(b));
  const earlier = rest.filter(ended);
  let plateLine = "";
  if (plate && plate === nowB) plateLine = `until ${c2Time(end(plate))}`;
  else if (plate && isToday) {
    const min = Math.round((plate.at - nowHour) * 60);
    plateLine = `in ${min >= 60 ? cvDur(min) : `${min} min`}`;
  }
  return {
    isToday,
    isPast,
    timed,
    allDay,
    clash,
    pairs,
    nowB,
    plate,
    plateLine,
    coming,
    earlier,
    nowAt: isToday ? coming.findIndex((b) => b.at > nowHour) : -1,
    booked: timed.reduce((s, b) => s + b.len, 0),
  };
}

/** The progress of what is on now, 0–1. */
export function nowProgress(b: Pick<CalTimed, "at" | "len">, nowHour: number) {
  return Math.min(1, Math.max(0, (nowHour - b.at) / (b.len / 60)));
}

/** "09:00–10:30". */
export const rangeLabel = (b: Pick<CalTimed, "at" | "len">) =>
  `${c2Time(b.at)}–${c2Time(b.at + b.len / 60)}`;

/** The card's third line and the Calendar fact: the calendar's name, or the project. */
export function itemLabel(b: CalItem) {
  if (b.event) {
    const e = b.entry;
    return "calendarName" in e && e.calendarName ? e.calendarName : "Calendar";
  }
  return b.project || "Task";
}

/** The day heading's second line: "3 planned · 2 h booked · 1 overlap". */
export function dayMeta(p: Pick<DayPlan, "timed" | "allDay" | "booked">) {
  const n = p.timed.length + p.allDay.length;
  return n
    ? `${n} planned${p.booked ? ` · ${cvDur(p.booked)} booked` : ""}`
    : "Nothing planned";
}

/** What the event sheet shows for a tapped item (PkEventSheet's `facts`). */
export function eventFacts(
  b: CalItem,
  clash: Record<string, string[]>
): { title: string; meta: string; facts: [string, string][] } {
  const d = calDay(b.date);
  const timed = b.at != null;
  const facts: [string, string][] = [
    [
      "Time",
      timed ? rangeLabel({ at: b.at as number, len: b.len }) : "All day",
    ],
  ];
  if (timed) facts.push(["Length", cvDur(b.len)]);
  facts.push(["Calendar", itemLabel(b)]);
  if (clash[b.id]) facts.push(["Overlaps", clash[b.id].join(", ")]);
  return { title: b.title, meta: `${d.long} ${d.n} ${d.mo}`, facts };
}

/* ---------- the week strip ---------- */

/** M T W T F S S, from the week's first day. */
export function weekLetters(startDay: string) {
  const l = ["S", "M", "T", "W", "T", "F", "S"];
  const from = startDay === "sunday" ? 0 : 1;
  return Array.from({ length: 7 }, (_, i) => l[(from + i) % 7]);
}

/** The seven days of the week that holds `day`. */
export function weekOf(day: string, startDay: string) {
  const from = weekStart(day, startDay);
  return Array.from({ length: 7 }, (_, i) => calDay(addDays(from, i)));
}

/** "31 Aug – 6 Sep". */
export function weekRange(days: readonly { n: number; mo: string }[]) {
  const a = days[0];
  const b = days[days.length - 1];
  return a && b ? `${a.n} ${a.mo} – ${b.n} ${b.mo}` : "";
}

/* ---------- the month ---------- */

export interface MonthCell {
  date: string;
  n: number;
  /** "4 Sep". */
  label: string;
  /** A day of the month before or after, drawn quiet. */
  other: boolean;
}

/** The month grid that holds `day`: whole weeks from the first, adjacent days marked. */
export function monthGrid(day: string, startDay: string) {
  const first = `${day.slice(0, 7)}-01`;
  const from = weekStart(first, startDay);
  const offset = daysBetween(from, first);
  const rows = Math.ceil((offset + dim(day)) / 7);
  const cells: MonthCell[] = Array.from({ length: rows * 7 }, (_, i) => {
    const date = addDays(from, i);
    return {
      date,
      n: +date.slice(8, 10),
      label: dayLabel(date) ?? "",
      other: date.slice(0, 7) !== day.slice(0, 7),
    };
  });
  return {
    month: LONG_MONTHS[+day.slice(5, 7) - 1],
    year: day.slice(0, 4),
    cells,
  };
}

/** The same day-of-month `k` months on, kept inside a shorter month. */
export function stepMonth(day: string, k: number) {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7) - 1 + k;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  const first = `${ny}-${pad(nm + 1)}-01`;
  return `${first.slice(0, 8)}${pad(Math.min(+day.slice(8, 10), dim(first)))}`;
}

/**
 * The days the events query covers for the view: the month grid that holds
 * `day`, always six weeks, so paging weeks inside a month does not refetch.
 * `to` is exclusive.
 */
export function visibleRange(day: string, startDay: string) {
  const from = weekStart(`${day.slice(0, 7)}-01`, startDay);
  return { from, to: addDays(from, 42) };
}

/** Sideways swipe: -1 / 1 for a clear horizontal swipe of 50 px or more, else 0. */
export function swipeStep(dx: number, dy: number) {
  return Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5
    ? dx < 0
      ? 1
      : -1
    : 0;
}

/* ---------- loading ---------- */

type Q = Pick<
  ScreenQuery,
  "status" | "fetchStatus" | "data" | "error" | "refetch"
>;

/** Two queries as one for the state layer: error beats pending, paused beats the rest. */
export function combineQueries(a: Q, b: Q): ScreenQuery {
  return {
    status:
      a.status === "error" || b.status === "error"
        ? "error"
        : a.status === "pending" || b.status === "pending"
          ? "pending"
          : "success",
    fetchStatus:
      a.fetchStatus === "paused" || b.fetchStatus === "paused"
        ? "paused"
        : a.fetchStatus,
    data: a.data !== undefined && b.data !== undefined ? true : undefined,
    error: a.error ?? b.error,
    refetch: () => {
      void a.refetch();
      void b.refetch();
    },
  };
}
