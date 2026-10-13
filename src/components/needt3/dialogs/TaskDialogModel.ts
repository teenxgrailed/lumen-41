/**
 * The task editor's labels and patches ($P/Dialogs.jsx TaskDialog 1–330),
 * pure: a v3 task and the person's day in, chip text and v3 patches out.
 * Dates are the prototype's local "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"; the
 * hooks convert them in the person's zone.
 */
import { formatInTimeZone } from "@/lib/date-utils";
import {
  addDays,
  dayLabel,
  daysBetween,
  moveDay,
  placeAt,
  timeLabel,
  weekday,
} from "@/lib/needt3/derive";
import type { V3Priority, V3Task, V3TaskPatch } from "@/lib/needt3/map";

export const TD_PRIO: readonly [V3Priority, string][] = [
  ["urgent", "Urgent"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];
export const TD_DUR = [15, 30, 45, 60, 90, 120, 180, 240] as const;
/** Minimum work block; `null` = "Don't split". */
export const TD_CHUNK = [null, 15, 25, 30, 45, 60, 90] as const;
export const TD_DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
export const TD_MONTH_LONG = [
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
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 45 → "45 min", 90 → "1 h 30", 120 → "2 h". */
export function tdDur(min: number | null | undefined) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** "Today", "Tomorrow", "Yesterday", else "Fri 4 Sep". */
export function tdDayName(day: string | null | undefined, today: string) {
  if (!day) return null;
  const diff = daysBetween(today, day.slice(0, 10));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${DOW_SHORT[weekday(day.slice(0, 10))]} ${dayLabel(day)}`;
}

/** "just now", "12 min ago", "at 14:05" (today), else "4 Sep". */
export function tdAgo(
  iso: string | null | undefined,
  nowMs: number,
  tz: string
) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const s = (nowMs - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  const day = formatInTimeZone(iso, tz, "yyyy-MM-dd");
  if (day === formatInTimeZone(nowMs, tz, "yyyy-MM-dd"))
    return `at ${formatInTimeZone(iso, tz, "HH:mm")}`;
  return dayLabel(day);
}

/** The month grid: leading blanks (Monday first), then every day. */
export function monthCells(year: number, month0: number) {
  const first = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
  const lead = (weekday(first) + 6) % 7;
  const next =
    month0 === 11
      ? `${year + 1}-01-01`
      : `${year}-${String(month0 + 2).padStart(2, "0")}-01`;
  const days = daysBetween(first, next);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 0; d < days; d++) cells.push(addDays(first, d));
  return cells;
}

/** Monday after today (a Monday goes a week on). */
export function nextMonday(today: string) {
  return addDays(today, (8 - weekday(today)) % 7 || 7);
}

export const monthTitle = (year: number, month0: number) =>
  `${TD_MONTH_LONG[month0]} ${year}`;

/* ---------- the date chip ---------- */

type Dated = Pick<
  V3Task,
  "dueDate" | "scheduledStart" | "scheduledEnd" | "estimatedMinutes"
>;

/** "Tomorrow · 09:30", "Fri 4 Sep", "09:30", or null. */
export function dateValue(t: Dated, today: string) {
  const time = timeLabel(t);
  const name = tdDayName(t.dueDate, today);
  return name ? name + (time ? ` · ${time}` : "") : time;
}

/** Pick a day (or clear it); a placed task keeps its hour. */
export function datePatch(
  t: Dated,
  day: string | null,
  today: string
): V3TaskPatch {
  if (!day)
    return {
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    };
  if (!t.scheduledStart) return { dueDate: day };
  const p = moveDay(t, day, today);
  return {
    dueDate: p.dueDate,
    scheduledStart: p.scheduledStart ?? null,
    scheduledEnd: p.scheduledEnd ?? null,
  };
}

/** "HH:mm" places the task at that hour (fixed); null takes the time off. */
export function timePatch(
  t: Dated,
  hhmm: string | null,
  today: string
): V3TaskPatch | null {
  if (!hhmm)
    return { scheduledStart: null, scheduledEnd: null, isFixed: false };
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const p = placeAt(t, t.dueDate || today, +m[1] + +m[2] / 60, today);
  return {
    dueDate: p.dueDate,
    scheduledStart: p.scheduledStart,
    scheduledEnd: p.scheduledEnd,
    isFixed: true,
    auto: false,
  };
}

/* ---------- Scheduling (owner: the sheet keeps it) ---------- */

type Sched = Pick<
  V3Task,
  | "isFixed"
  | "chunk"
  | "splitAllowed"
  | "deadline"
  | "hardDeadline"
  | "scheduleId"
  | "scheduledStart"
>;

/** Placement: Fixed = scheduleLocked; Auto lets Needt move it. */
export const fixedPatch = (fixed: boolean): V3TaskPatch =>
  fixed ? { isFixed: true, auto: false } : { isFixed: false, auto: true };

/**
 * Min. work block. `null` = "Don't split" (`splitAllowed` false); a number
 * sets `minChunkMinutes`. Choosing the pressed pill again returns to the
 * engine default (split allowed, no minimum).
 */
export function chunkPatch(
  t: Pick<V3Task, "chunk" | "splitAllowed">,
  pick: number | null
): V3TaskPatch {
  if (chunkPressed(t, pick)) return { chunk: null, splitAllowed: true };
  return pick == null
    ? { chunk: null, splitAllowed: false }
    : { chunk: pick, splitAllowed: true };
}

export function chunkPressed(
  t: Pick<V3Task, "chunk" | "splitAllowed">,
  pick: number | null
) {
  return pick == null ? !t.splitAllowed : t.splitAllowed && t.chunk === pick;
}

export function isSchedDefault(t: Sched) {
  return (
    !t.isFixed && !t.chunk && t.splitAllowed && !t.deadline && !t.scheduleId
  );
}

/** "Fixed 09:30 · min block 25 min · hard deadline 4 Sep · Personal". */
export function schedSummary(t: Sched, hoursName?: string | null) {
  const time = timeLabel(t);
  return [
    (t.isFixed ? "Fixed" : "Auto") + (time ? ` ${time}` : ""),
    !t.splitAllowed
      ? "don’t split"
      : t.chunk
        ? `min block ${t.chunk} min`
        : null,
    t.deadline
      ? `${t.hardDeadline ? "hard deadline" : "deadline"} ${dayLabel(t.deadline)}`
      : null,
    t.scheduleId && hoursName ? hoursName.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The hint beside Placement. */
export function placementHint(t: Pick<Sched, "isFixed" | "scheduledStart">) {
  const time = timeLabel(t);
  if (t.isFixed) return time ? `Stays at ${time}` : "Stays where you put it";
  return time ? `Planned ${time} — Needt may move it` : "Needt finds the slot";
}

/* ---------- the chip row ---------- */

export interface ChipBox {
  k: string;
  filled: boolean;
  /** Measured width in px. */
  w: number;
}

/**
 * Which chips fold into "+N" so the row stays one line: empty chips go
 * first, then filled ones from the end (the date stays longest).
 */
export function foldChips(
  items: readonly ChipBox[],
  avail: number,
  gap: number,
  moreW: number
) {
  const width = (l: readonly ChipBox[]) =>
    l.reduce((a, it) => a + it.w, 0) + gap * Math.max(0, l.length - 1);
  const out: string[] = [];
  if (width(items) <= avail + 0.5) return out;
  const order = items
    .filter((it) => !it.filled)
    .reverse()
    .concat(items.filter((it) => it.filled).reverse());
  let shown = items.slice();
  for (let i = 0; i < order.length && shown.length > 1; i++) {
    if (width(shown) + gap + moreW <= avail + 0.5) break;
    shown = shown.filter((it) => it !== order[i]);
    out.push(order[i].k);
  }
  return out;
}

/** "4 Sep" for the footer ("Created 4 Sep"). */
export const shortDay = (day: string | null | undefined) =>
  day ? dayLabel(day.slice(0, 10)) : null;

/** The fields a duplicate carries over (parts are copied separately). */
export function duplicateDraft(t: V3Task): V3TaskPatch & { title: string } {
  return {
    title: `${t.title} (copy)`,
    // POST /api/tasks requires a status; the map writes it from `done`.
    done: false,
    notes: t.notes,
    projectId: t.projectId,
    dueDate: t.dueDate,
    estimatedMinutes: t.estimatedMinutes,
    priority: t.priority,
    entry: t.entry,
    chunk: t.chunk,
    splitAllowed: t.splitAllowed,
    deadline: t.deadline,
    hardDeadline: t.hardDeadline,
    scheduleId: t.scheduleId,
  };
}

/** Move `from` to `to` in a list (subtask drag). */
export function moveItem<T>(list: readonly T[], from: number, to: number) {
  const c = list.slice();
  const [m] = c.splice(from, 1);
  c.splice(to, 0, m);
  return c;
}
