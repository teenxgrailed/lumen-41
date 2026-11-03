/* Moving and resizing a calendar event on the grid — pure, so jest pins it.
 *
 * The same quarter-hour snap the task drag and the personal bands use. An
 * event is written as v3 stamps ("YYYY-MM-DDTHH:mm", the person's own zone),
 * the shape `useUpdateEvent` takes, which sends a synced calendar's event to
 * its provider. A move keeps the length and may change the day; a resize moves
 * only the end. All-day events live above the grid and are never moved here.
 */
import { addDays, addMinutes, minutesBetween } from "@/lib/needt3/derive";
import type { V3Event } from "@/lib/needt3/map";

import { DRAG_SNAP_HOURS } from "./geometry";

/** An event travels through the drag as this prefix and its id. */
export const EVENT_DRAG_PREFIX = "ev:";

/** An event is never shorter than this (and snaps in these steps). */
export const EVENT_MIN_MINUTES = DRAG_SNAP_HOURS * 60;
const DAY_MINUTES = 24 * 60;
const DEFAULT_MINUTES = 30;

export type EventGesture = "move" | "resize";

export interface EventStamps {
  startAt: string;
  endAt: string;
}

const clockMinutes = (text: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * What a move or a resize writes, or null when it changes nothing (or cannot
 * be done: an all-day event, or a stamp that does not read).
 * `deltaHours` is how far the hand travelled on the grid; it is snapped here.
 * `dayDelta` is how many columns the drop crossed (a move only).
 */
export function eventGesturePatch(
  event: Pick<V3Event, "startAt" | "endAt" | "isAllDay">,
  gesture: EventGesture,
  deltaHours: number,
  dayDelta = 0
): EventStamps | null {
  if (event.isAllDay) return null;
  const from = clockMinutes(event.startAt);
  if (from == null) return null;
  const step = EVENT_MIN_MINUTES;
  const delta = Math.round((deltaHours * 60) / step) * step;
  const length = event.endAt
    ? minutesBetween(event.startAt, event.endAt)
    : DEFAULT_MINUTES;
  if (length <= 0) return null;
  if (gesture === "move") {
    if (delta === 0 && dayDelta === 0) return null;
    const to = Math.min(
      DAY_MINUTES - step,
      Math.max(0, Math.round((from + delta) / step) * step)
    );
    if (to === from && dayDelta === 0) return null;
    const day = addDays(event.startAt.slice(0, 10), dayDelta);
    const startAt = `${day}T${pad2(Math.floor(to / 60))}:${pad2(to % 60)}`;
    const endAt = addMinutes(startAt, length);
    return endAt ? { startAt, endAt } : null;
  }
  const kept = Math.max(step, length + delta);
  if (kept === length) return null;
  const endAt = addMinutes(event.startAt, kept);
  return endAt ? { startAt: event.startAt, endAt } : null;
}
