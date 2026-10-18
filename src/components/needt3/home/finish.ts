/**
 * The end of the day on Home, pure: what a finished day offers next, and what
 * the shutdown sheet moves. `today` ("YYYY-MM-DD") is always an argument and
 * nothing here reads the clock.
 */
import { addDays, dayLabel, moveDay, weekday } from "@/lib/needt3/derive";
import type { V3Priority, V3Task, V3TaskPatch } from "@/lib/needt3/map";

import { type Capacity, dayOf, dur } from "./derive";

/** How many next tasks the finished-day card offers at most. */
export const FINISH_PICKS = 3;

export type PickSource = "overdue" | "tomorrow" | "inbox";

export interface FinishPick {
  task: V3Task;
  from: PickSource;
  /** The estimate fits the free time left today. */
  fits: boolean;
  /** "Overdue since 3 Sep · 25 min", short and plain. */
  meta: string;
}

const PRIORITY_RANK: Record<V3Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const hourOfClock = (s: string) => {
  const [h, m] = String(s || "").split(":");
  return (+h || 0) + (+m || 0) / 60;
};

/**
 * Minutes of working time left today: from now (or the start of work, if that
 * is later) to the end of work, less the events still ahead. `null` on a day
 * the person does not work, so nothing is judged against it.
 */
export function freeMinutesLeft(
  cap: Pick<Capacity, "start" | "end" | "weekends">,
  today: string,
  nowHour: number,
  events: readonly { at: number; len: number }[] = []
): number | null {
  const dow = weekday(today);
  if ((dow === 0 || dow === 6) && !cap.weekends) return null;
  const end = hourOfClock(cap.end);
  const from = Math.max(nowHour, hourOfClock(cap.start));
  if (end <= from) return 0;
  const busy = events.reduce((sum, e) => {
    const s = Math.max(e.at, from);
    const f = Math.min(e.at + e.len / 60, end);
    return sum + Math.max(0, f - s);
  }, 0);
  return Math.max(0, Math.round((end - from - busy) * 60));
}

const sourceOf = (
  t: V3Task,
  today: string,
  tomorrow: string
): PickSource | null => {
  const d = dayOf(t, today);
  if (!d) return "inbox";
  if (d < today) return "overdue";
  if (d === tomorrow) return "tomorrow";
  return null;
};

function metaOf(t: V3Task, from: PickSource) {
  const bits: string[] = [];
  if (from === "overdue" && t.dueDate)
    bits.push(`Overdue since ${dayLabel(t.dueDate)}`);
  else if (from === "tomorrow") bits.push("Tomorrow");
  else bits.push("Inbox");
  const d = dur(t.estimatedMinutes);
  if (d) bits.push(d);
  return bits.join(" · ");
}

/**
 * The best next tasks once today is done, from overdue, tomorrow and the
 * Inbox. Ranked by due day (earliest first, none last), then priority, then
 * whether the estimate fits the time left today (a fit first, no estimate
 * next, too long last; the closer fit wins). Done, trashed and unplaceable
 * tasks never appear.
 */
export function pickFinishNext(
  tasks: readonly V3Task[],
  today: string,
  freeMin: number | null,
  limit = FINISH_PICKS
): FinishPick[] {
  const tomorrow = addDays(today, 1);
  const fitRank = (t: V3Task) => {
    if (freeMin == null || !t.estimatedMinutes) return 1;
    return t.estimatedMinutes <= freeMin ? 0 : 2;
  };
  const pool = tasks.flatMap((t) => {
    if (t.done || t.trashedAt || t.noSlot) return [];
    const from = sourceOf(t, today, tomorrow);
    return from ? [{ t, from }] : [];
  });
  pool.sort((a, b) => {
    const da = a.t.dueDate ?? "9999-99-99";
    const db = b.t.dueDate ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const p = PRIORITY_RANK[a.t.priority] - PRIORITY_RANK[b.t.priority];
    if (p) return p;
    const f = fitRank(a.t) - fitRank(b.t);
    if (f) return f;
    if (fitRank(a.t) === 0)
      return (b.t.estimatedMinutes ?? 0) - (a.t.estimatedMinutes ?? 0);
    return 0;
  });
  return pool.slice(0, limit).map(({ t, from }) => ({
    task: t,
    from,
    fits: fitRank(t) === 0,
    meta: metaOf(t, from),
  }));
}

/** "Do today": the task onto today, keeping its hour if it had one. */
export const doTodayPatch = (t: V3Task, today: string): V3TaskPatch =>
  moveDay(t, today, today);

export type LeftoverTarget = "tomorrow" | "date" | "inbox";

/** What `target` does to a task. `date` falls back to tomorrow without one. */
export function leftoverPatch(
  t: V3Task,
  target: LeftoverTarget,
  today: string,
  date?: string | null
): V3TaskPatch {
  if (target === "inbox")
    return { dueDate: null, scheduledStart: null, scheduledEnd: null };
  const day = target === "date" && date ? date : addDays(today, 1);
  return moveDay(t, day, today);
}

export interface Shutdown {
  /** Tasks closed today (the day's own, newest order kept). */
  done: V3Task[];
  /** Open tasks still on today, then the overdue ones. */
  leftovers: V3Task[];
}

/** What the shutdown sheet shows: the day's done work and what is left. */
export function shutdownOf(
  late: readonly V3Task[],
  day: readonly V3Task[]
): Shutdown {
  const seen = new Set<string>();
  const leftovers = [...day, ...late].filter((t) => {
    if (t.done || t.trashedAt || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  return { done: day.filter((t) => t.done && !t.trashedAt), leftovers };
}

/**
 * The headline of a finished day. "All done" is said only when nothing is
 * open that Home still lists: no overdue task, none in the Inbox.
 */
export function finishHeadline(open: { late: number; inbox: number }) {
  const rest = open.late + open.inbox;
  if (!rest) return { title: "All done for today", rest: 0 };
  return { title: "Today’s tasks are done", rest };
}

/** "2 overdue · 3 in Inbox still open", or "". */
export function restLine(open: { late: number; inbox: number }) {
  const bits: string[] = [];
  if (open.late) bits.push(`${open.late} overdue`);
  if (open.inbox) bits.push(`${open.inbox} in Inbox`);
  return bits.length ? `${bits.join(" · ")} still open` : "";
}

/** The note for tomorrow, as Markdown for the day's note, or "" when it has nothing to say. */
export function tomorrowNote(text: string): string {
  const body = text.trim();
  return body ? `## From yesterday\n\n${body}` : "";
}
