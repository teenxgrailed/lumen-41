import { dayInZone } from "@/services/scheduling/spread";

import { formatInTimeZone } from "@/lib/date-utils";

/**
 * "Given a later day" for Always easy start's `rescheduleCount`: any move to a
 * LATER calendar day counts, whoever made it (the person, an agent or the
 * scheduler). A move to an earlier day, a new time on the same day, and a task
 * that had no day before do not count. Pure: no clock, no database.
 */

type When = Date | string | null | undefined;

const toDate = (value: When): Date | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The calendar day of a placed time, in the person's zone. */
const placedDay = (value: Date, timeZone: string) =>
  formatInTimeZone(value, timeZone, "yyyy-MM-dd");

/** The scheduler (or a drag) gave a placed task a later calendar day. */
export function placedLater(before: When, next: When, timeZone: string) {
  const a = toDate(before);
  const b = toDate(next);
  if (!a || !b) return false;
  return placedDay(b, timeZone) > placedDay(a, timeZone);
}

/**
 * A patch moves a task to a later day when its placed start or its due day
 * lands on a later day than before. A key missing from the patch is unchanged.
 */
export function movedToLaterDay(
  before: { dueDate: When; scheduledStart: When },
  patch: { dueDate?: When; scheduledStart?: When },
  timeZone: string
): boolean {
  if (
    patch.scheduledStart !== undefined &&
    placedLater(before.scheduledStart, patch.scheduledStart, timeZone)
  ) {
    return true;
  }
  if (patch.dueDate !== undefined) {
    const a = toDate(before.dueDate);
    const b = toDate(patch.dueDate);
    if (a && b) {
      const from = dayInZone(a, timeZone);
      const to = dayInZone(b, timeZone);
      if (from && to && to > from) return true;
    }
  }
  return false;
}
