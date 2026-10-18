/**
 * The time-left line, pure: today's planned work against the working time
 * that is still left.
 */
import type { V3Task } from "@/lib/needt3/map";

import { dur } from "./derive";

export interface TimeLeft {
  /** Minutes still planned today: open tasks plus events still ahead. */
  planned: number;
  /** Working minutes left today, less personal blocks. */
  free: number;
  /** planned / free, capped at 1 for the bar. */
  fill: number;
  over: boolean;
  /** Minutes beyond the free time when over, else 0. */
  overBy: number;
}

/** Minutes of events (or blocks) still ahead of `nowHour`. */
export function minutesAhead(
  items: readonly { at: number; len: number }[],
  nowHour: number
) {
  return Math.round(
    items.reduce((sum, e) => {
      const from = Math.max(e.at, nowHour);
      const to = e.at + e.len / 60;
      return sum + Math.max(0, to - from) * 60;
    }, 0)
  );
}

/**
 * Minutes of personal time (lunch, a walk) that fall inside the working time
 * still left, `[from, to)` in decimal hours. Time outside work takes nothing
 * from it; overlapping blocks are counted once.
 */
export function blockedMinutes(
  bands: readonly { from: number; to: number }[],
  from: number,
  to: number
) {
  const spans = bands
    .map((b) => [Math.max(b.from, from), Math.min(b.to, to)] as const)
    .filter(([a, z]) => z > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [a, z] of spans) {
    const start = Math.max(a, cursor);
    if (z > start) total += z - start;
    cursor = Math.max(cursor, z);
  }
  return Math.round(total * 60);
}

/**
 * `capacity` = working minutes left (`freeMinutesLeft` without the events),
 * `blocked` = minutes taken by protected personal blocks. Null when there is
 * nothing to say: a day off, work over, or nothing planned.
 */
export function timeLeft(o: {
  capacity: number | null;
  blocked?: number;
  eventsAhead: number;
  openTasks: readonly Pick<V3Task, "done" | "estimatedMinutes">[];
}): TimeLeft | null {
  if (o.capacity == null || o.capacity <= 0) return null;
  const planned =
    o.eventsAhead +
    o.openTasks
      .filter((t) => !t.done)
      .reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
  if (planned < 5) return null;
  const free = Math.max(0, o.capacity - (o.blocked ?? 0));
  const over = planned > free;
  return {
    planned,
    free,
    fill: free ? Math.min(1, planned / free) : 1,
    over,
    overBy: over ? planned - free : 0,
  };
}

/** "3 h planned · 1 h 30 free", or the soft warning when overbooked. */
export function timeLeftLine(t: TimeLeft) {
  return t.over
    ? `${dur(t.planned)} planned, ${dur(t.overBy)} more than the time left`
    : `${dur(t.planned)} planned · ${dur(t.free - t.planned) || "0 min"} free`;
}
