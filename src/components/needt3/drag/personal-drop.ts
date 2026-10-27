/* Whether a drop lands a task inside personal time — pure, so jest pins it.
 *
 * The scheduler never places a task in Lunch, a Walk or any other block the
 * person keeps. A person may still put one there by hand; the drop host asks
 * first. The patch carries the zone strings the v3 screens speak
 * ("YYYY-MM-DDTHH:mm", the person's own time zone).
 */
import {
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { daysOfRule, weeklyRule } from "@/lib/personal-time";
import { type DayBand, bandAt } from "@/lib/personal-time-days";
import type { EditableBlock, PersonalPatch } from "@/lib/personal-time-edit";

import { DRAG_SNAP_HOURS, snapDragTime } from "./geometry";

const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

const hourOf = (hh: string, mm: string) => Number(hh) + Number(mm) / 60;

/** The band a timed placement touches, or null. Tasks without a time touch none. */
export function personalHitForPlacement(
  bands: ReadonlyMap<string, readonly DayBand[]>,
  start: string | null | undefined,
  end: string | null | undefined
): DayBand | null {
  const a = start ? STAMP.exec(start) : null;
  if (!a) return null;
  const b = end ? STAMP.exec(end) : null;
  const from = hourOf(a[2], a[3]);
  if (!b || b[1] !== a[1]) {
    // no end (or one on another day): the start day, from the start to its end
    const stop = b ? 24 : Math.min(24, from + 0.5);
    return bandAt(bands.get(a[1]), from, stop);
  }
  const to = Math.max(hourOf(b[2], b[3]), from + 1 / 60);
  return bandAt(bands.get(a[1]), from, to);
}

/* ── Moving and resizing a band on the grid ───────────────────────────────
 *
 * The same quarter-hour snap the task drag uses (`snapDragTime`). A move
 * keeps the block's length and shifts its clock time; a resize moves only the
 * end. Both work on the block's own clock in the person's zone, on the block's
 * own first day, so a repeating block keeps its weekdays: the whole series
 * moves together. The start stays inside its day; the end may run past
 * midnight, so a late dinner can be dragged to end at 01:00.
 */

/** A personal band travels through the drag as this prefix and its block's id. */
export const PERSONAL_DRAG_PREFIX = "pb:";

/** A personal block is never shorter than this (and snaps in these steps). */
export const PERSONAL_MIN_MINUTES = DRAG_SNAP_HOURS * 60;
const DAY_MINUTES = 24 * 60;

export type BandGesture = "move" | "resize";

/** Whether a band can be moved or resized by hand. A block marked on a calendar event follows the event. */
export function bandIsDraggable(band: Pick<DayBand, "linked">) {
  return !band.linked;
}

/** How far a bottom-edge drag of `dy` px moved the end, in snapped hours. */
export function resizeDeltaHours(dy: number, hourH: number) {
  if (!hourH) return 0;
  // snapDragTime snaps an hour of day to the quarter hour; a distance snaps the same way
  return snapDragTime(dy / hourH);
}

const minutesOf = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

const clockOf = (minutes: number) => {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Whole days from one "YYYY-MM-DD" to another (calendar days, so DST never skews it). */
export function dayDeltaBetween(from: string, to: string) {
  const at = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** A "YYYY-MM-DD" moved by whole calendar days. */
function shiftDay(day: string, days: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The rule with every weekday moved by `days`, wrapping the week (SU + 1 =
 * MO). A daily rule and any rule that is not a plain weekly one stay as they
 * are: only the time of day follows the drop there.
 */
export function shiftedRule(rule: string | null, days: number) {
  const of = daysOfRule(rule);
  if (!rule || !of || of.length === 7) return rule;
  return weeklyRule(of.map((d) => (((d + days) % 7) + 7) % 7)) ?? rule;
}

/** Whether a day change moves this block's weekdays (a one-off, or a plain weekly rule). */
function followsDay(rule: string | null) {
  if (!rule) return true;
  const of = daysOfRule(rule);
  return Boolean(of) && of!.length < 7;
}

/**
 * What a move or a resize writes, or null when it changes nothing (or cannot
 * be done: a block linked to an event, or one a day long or longer).
 * `deltaHours` is how far the pointer travelled in hours of the grid; it is
 * snapped here, so a caller may pass the raw difference of two pointer times.
 * `dayDelta` is how many columns the drop crossed: a one-off block moves to
 * that day, a weekly one moves its weekdays by it, a daily one ignores it.
 */
export function bandGesturePatch(
  block: Pick<EditableBlock, "start" | "end" | "sourceEventId"> & {
    rrule?: string | null;
  },
  timeZone: string,
  gesture: BandGesture,
  deltaHours: number,
  dayDelta = 0
): PersonalPatch | null {
  if (block.sourceEventId) return null;
  const start = newDate(block.start);
  const length = Math.round(
    (newDate(block.end).getTime() - start.getTime()) / 60_000
  );
  if (length <= 0 || length >= DAY_MINUTES) return null;
  const day = formatInTimeZone(start, timeZone, "yyyy-MM-dd");
  const from = minutesOf(formatInTimeZone(start, timeZone, "HH:mm"));
  const step = PERSONAL_MIN_MINUTES;
  const delta = Math.round((deltaHours * 60) / step) * step;
  if (gesture === "move") {
    const days = followsDay(block.rrule ?? null) ? dayDelta : 0;
    if (delta === 0 && days === 0) return null;
    const to = Math.min(
      DAY_MINUTES - step,
      Math.max(0, Math.round((from + delta) / step) * step)
    );
    if (to === from && days === 0) return null;
    const next = fromZonedTime(
      `${shiftDay(day, days)}T${clockOf(to)}:00`,
      timeZone
    );
    const patch: PersonalPatch = {
      start: next.toISOString(),
      end: addMinutes(next, length).toISOString(),
    };
    if (block.rrule && days !== 0)
      patch.rrule = shiftedRule(block.rrule ?? null, days);
    return patch;
  }
  const end = Math.round((from + length + delta) / step) * step;
  const kept = Math.min(
    DAY_MINUTES - step,
    Math.max(PERSONAL_MIN_MINUTES, end - from)
  );
  if (kept === length) return null;
  return { end: addMinutes(start, kept).toISOString() };
}
