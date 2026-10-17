/* THE ENDLESS DAY STRIP — the pure half of the Week view's horizontal scroll.
 *
 * The week grid is one wide scroller of day columns. Only the columns near
 * the viewport are in the DOM; the rest is width. A day has a fixed index
 * (days from an origin the view fixes when it mounts), a column sits at
 * `index × columnWidth`, and the scroll position is that same product, so a
 * scroll handler needs one number (`scrollLeft`) and one division to know
 * which days to draw. No DOM, no clock, no React.
 */
import { addDays, daysBetween } from "@/lib/needt3/derive";

/** Days either side of the origin the strip can reach (~27 years in all). */
export const STRIP_SPAN = 5000;
export const STRIP_TOTAL = STRIP_SPAN * 2;
/** Columns kept drawn past each edge: a week of prefetch either side. */
export const STRIP_BUFFER = 7;
/** A scroll further than this many days jumps first, then glides the rest. */
export const STRIP_GLIDE = 21;

/** Index of `date` on a strip whose origin is `origin`, clamped to it. */
export function stripIndex(origin: string, date: string) {
  const i = STRIP_SPAN + daysBetween(origin, date);
  return Math.min(Math.max(i, 0), STRIP_TOTAL - 1);
}

/** The day at strip index `i`. */
export const stripDate = (origin: string, i: number) =>
  addDays(origin, i - STRIP_SPAN);

/** The day column nearest the left edge for a scroll offset. */
export function nearestIndex(scrollLeft: number, colW: number) {
  if (colW <= 0) return STRIP_SPAN;
  const i = Math.round(scrollLeft / colW);
  return Math.min(Math.max(i, 0), STRIP_TOTAL - 1);
}

/** The scroll offset at which index `i` is the first column. */
export const offsetOf = (i: number, colW: number) => i * colW;

/** Indices to draw when `first` is the first visible column of `n`. */
export function drawnRange(first: number, n: number) {
  return {
    from: Math.max(0, first - STRIP_BUFFER),
    to: Math.min(STRIP_TOTAL - 1, first + n - 1 + STRIP_BUFFER),
  };
}

/** Column width for a viewport (px) minus the hour gutter, split `n` ways. */
export const columnWidth = (viewport: number, gutter: number, n: number) =>
  Math.max(0, (viewport - gutter) / n);

/**
 * Where a jump of `days` from the column it is heading to (or standing on)
 * lands. `base` is the goal of a glide still running, else the current first
 * column; chained clicks therefore add up instead of restarting.
 */
export function jumpGoal(base: number, days: number) {
  return Math.min(Math.max(base + days, 0), STRIP_TOTAL - 1);
}

/**
 * A move from `from` to `goal` (indices) as it should be driven: a long one
 * is first set down `STRIP_GLIDE` days short of the goal and only that last
 * stretch glides, so "Today" from two years away does not scroll through two
 * years of columns.
 */
export function glidePlan(from: number, goal: number) {
  const dist = goal - from;
  if (Math.abs(dist) <= STRIP_GLIDE) return { jumpTo: null, goal };
  return { jumpTo: goal - Math.sign(dist) * STRIP_GLIDE, goal };
}

/** The scroll offset the tracked vertical position takes so "now" sits a third down. */
export function nowScrollTop(
  nowHour: number,
  hourH: number,
  viewportH: number,
  contentH: number
) {
  const want = nowHour * hourH - viewportH / 3;
  return Math.min(Math.max(0, want), Math.max(0, contentH - viewportH));
}

/** What the grid needs of the person's working hours. */
export interface WorkHours {
  /** Weekdays that are working days, 0 = Sunday … 6 = Saturday. */
  days: readonly number[];
  /** First and last working hour, 0–24 (end exclusive). */
  start: number;
  end: number;
}

/** Hour spans of a day that are outside working hours: [from, to) each. */
export function offHours(
  weekdayOf: number,
  hours: WorkHours | null | undefined
): [number, number][] {
  if (!hours) return [];
  if (!hours.days.includes(weekdayOf)) return [[0, 24]];
  const spans: [number, number][] = [];
  if (hours.start > 0) spans.push([0, Math.min(hours.start, 24)]);
  if (hours.end < 24) spans.push([Math.max(hours.end, 0), 24]);
  return spans.filter(([a, b]) => b > a);
}

/** The schedule row (`workDays` is a JSON string of weekday numbers) → WorkHours. */
export function workHoursOf(
  row:
    | { workDays: string; workHourStart: number; workHourEnd: number }
    | null
    | undefined
): WorkHours | null {
  if (!row) return null;
  let days: number[] = [1, 2, 3, 4, 5];
  try {
    const parsed: unknown = JSON.parse(row.workDays);
    if (Array.isArray(parsed))
      days = parsed.filter(
        (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6
      );
  } catch {
    /* keep the default week */
  }
  const start = Math.min(Math.max(row.workHourStart, 0), 24);
  const end = Math.min(Math.max(row.workHourEnd, 0), 24);
  return { days, start, end: end > start ? end : 24 };
}
