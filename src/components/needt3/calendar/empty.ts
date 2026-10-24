/* The calendar's empty week (desktop Week / Agenda, phone schedule).
 *
 * Pure. Two states, both over a week that has nothing of the person's
 * calendar in it:
 *  - "connect": no calendar connected (Needt's own LOCAL calendar does not
 *    count) and no event in the days on screen. A card offers to connect
 *    one or to add an event. Placed tasks may still be on the grid, so the
 *    card never claims the week is empty.
 *  - "quiet": a calendar is connected but the days on screen hold nothing at
 *    all, events or tasks. A hint says so.
 * Either goes as soon as a feed is connected or an event lands in view.
 */
import type { CalBlock } from "./layout";

export type CalendarEmpty = "connect" | "quiet" | null;

export const CAL_EMPTY_COPY = {
  line: "No calendar here yet. Connect one and Needt plans your tasks around what is already booked.",
  connect: "Connect a calendar",
  add: "Add an event",
  quiet: "Nothing this week",
} as const;

/** A feed the person connected: anything but Needt's own (LOCAL) calendar. */
export function hasConnectedFeed(
  feeds: readonly { type: string }[] | undefined
): boolean {
  return (feeds ?? []).some((f) => f.type !== "LOCAL");
}

export function calendarEmptyState({
  feeds,
  items,
  days,
}: {
  /** GET /api/feeds; undefined while it loads (nothing is drawn then). */
  feeds: readonly { type: string }[] | undefined;
  /** Every timed and all-day item the calendar could draw. */
  items: readonly Pick<CalBlock, "date" | "event">[];
  /** "YYYY-MM-DD" of each day on screen. */
  days: readonly string[];
}): CalendarEmpty {
  if (!feeds) return null;
  const shown = new Set(days);
  const inView = items.filter((b) => shown.has(b.date));
  if (!hasConnectedFeed(feeds)) {
    return inView.some((b) => b.event) ? null : "connect";
  }
  return inView.length ? null : "quiet";
}
