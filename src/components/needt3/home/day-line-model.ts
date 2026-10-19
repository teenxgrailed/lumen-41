/**
 * The first event of the day on Home, pure (the weather line is `ha/model`).
 */
import { hhmm, hourOf } from "@/lib/needt3/derive";
import type { V3Event } from "@/lib/needt3/map";

export interface FirstEvent {
  title: string;
  /** "10:00" */
  at: string;
}

/** The next timed event today that has not started. */
export function firstEvent(
  events: readonly V3Event[],
  today: string,
  nowHour: number
): FirstEvent | null {
  let best: { e: V3Event; h: number } | null = null;
  for (const e of events) {
    if (e.isAllDay || !e.startAt.startsWith(today)) continue;
    const h = hourOf(e.startAt);
    if (h == null || h < nowHour) continue;
    if (!best || h < best.h) best = { e, h };
  }
  if (!best) return null;
  return { title: best.e.title, at: hhmm(best.h) ?? "" };
}
