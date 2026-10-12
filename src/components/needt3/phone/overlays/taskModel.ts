/**
 * The task sheet's rules, pure (phone-overlays.jsx `PkTaskSheet`): which
 * choices each fact offers, and the patch each choice writes. The prototype
 * wrote through a local store; here every function returns a `V3TaskPatch`
 * and the sheet sends it through `useUpdateTask`, so Undo and the offline
 * queue stay the hook's job. `today` is always the person's day.
 */
import { clock, durLabel } from "@/lib/needt3/day";
import {
  addDays,
  addMinutes,
  dayLabel,
  at as hourAt,
  moveDay,
  placeAt,
} from "@/lib/needt3/derive";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";

type T = Pick<
  V3Task,
  | "dueDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "estimatedMinutes"
  | "isFixed"
  | "chunk"
  | "splitAllowed"
  | "deadline"
  | "hardDeadline"
>;

/* ---------- the choices (POV_* in the prototype) ---------- */

export const EST = [15, 30, 45, 60, 90, 120, 180] as const;
/** [label, days from today] */
export const DAYS = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["In 2 days", 2],
  ["Next week", 7],
] as const;
export const HOURS = [9, 11, 14, 17] as const;
/** `null` = don't split. */
export const CHUNK = [null, 15, 25, 30, 45, 60, 90] as const;
export const DEADLINE = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["In 2 days", 2],
  ["Next week", 7],
  ["In 2 weeks", 14],
] as const;
export const PRIORITIES = [
  ["urgent", "Urgent"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const;

/* ---------- reading ---------- */

/** "Today", "Tomorrow", else "4 Sep". */
export function dueWords(day: string | null | undefined, today: string) {
  if (!day) return null;
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return dayLabel(day);
}

/** The hour the task sits at, "09:30", or null. */
export function timeWords(t: Pick<T, "scheduledStart">) {
  const h = hourAt({ scheduledStart: t.scheduledStart });
  return h == null ? null : clock(h);
}

/** Is `n` days from today the task's day (and the task not already late)? */
export function dayIsOn(t: Pick<T, "dueDate">, n: number, today: string) {
  return !!t.dueDate && t.dueDate === addDays(today, n) && t.dueDate >= today;
}

/** The folded Scheduling card's one line. */
export function scheduleSummary(t: T, today: string): string {
  const at = timeWords(t);
  const deadline = t.deadline ? dueWords(t.deadline, today) : null;
  return [
    (t.isFixed ? "Fixed" : "Auto") + (at ? ` ${at}` : ""),
    !t.splitAllowed ? "no split" : t.chunk ? `min block ${t.chunk} min` : null,
    deadline
      ? `${t.hardDeadline ? "hard deadline" : "deadline"} ${deadline}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What the Min. work block row shows. */
export function chunkWords(t: Pick<T, "chunk" | "splitAllowed">) {
  return !t.splitAllowed ? "Don’t split" : t.chunk ? `${t.chunk} min` : "Auto";
}

export const durationWords = durLabel;

/* ---------- writing ---------- */

/** Another day, keeping the hour. */
export const dayPatch = (t: T, n: number, today: string): V3TaskPatch =>
  moveDay(t, addDays(today, n), today);

/** No day: nothing left to place. */
export const noDayPatch = (): V3TaskPatch => ({
  dueDate: null,
  scheduledStart: null,
  scheduledEnd: null,
  isFixed: false,
});

/** An hour on the task's day (today when it has none): the person's choice, so it is fixed. */
export const hourPatch = (t: T, hour: number, today: string): V3TaskPatch =>
  placeAt(t, t.dueDate ?? today, hour, today);

export const anyTimePatch = (): V3TaskPatch => ({
  scheduledStart: null,
  scheduledEnd: null,
  isFixed: false,
});

/** A new length; a placed task's end follows its start. */
export function durationPatch(t: T, minutes: number): V3TaskPatch {
  return t.scheduledStart
    ? {
        estimatedMinutes: minutes,
        scheduledEnd: addMinutes(t.scheduledStart, minutes),
      }
    : { estimatedMinutes: minutes };
}

export const placementPatch = (fixed: boolean): V3TaskPatch => ({
  isFixed: fixed,
  auto: !fixed,
});

/** `null` = don't split; a number is the shortest block the scheduler may cut. */
export const chunkPatch = (c: number | null): V3TaskPatch =>
  c == null ? { splitAllowed: false } : { splitAllowed: true, chunk: c };

/** A deadline `n` days from today, or none (which also drops "hard"). */
export const deadlinePatch = (n: number | null, today: string): V3TaskPatch =>
  n == null
    ? { deadline: null, hardDeadline: false }
    : { deadline: addDays(today, n) };
