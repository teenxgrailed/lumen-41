import { type Options, RRule } from "rrule";

import { wallClockAsUtc, zonedWallToDate } from "@/lib/date-utils";

import { HubError } from "./errors";

/**
 * Recurrence rules for hub items. The rule is an iCalendar RRULE evaluated on
 * the wall clock of an IANA time zone, so "every Monday at 9" stays at 9 on
 * both sides of a clock change. Same `rrule` library as recurring tasks.
 *
 * Allowed: DAILY, WEEKLY, MONTHLY, YEARLY. Sub-daily frequencies are refused:
 * a standing job is not a heartbeat, and the worker sweeps every five minutes.
 */

const FREQUENCIES = [RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY];
const MAX_STEPS = 6;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function assertTimeZone(timeZone: string) {
  if (!isValidTimeZone(timeZone)) {
    throw new HubError(
      "INVALID",
      `recurrence.timezone: "${timeZone}" is not an IANA time zone such as Europe/Kyiv or America/New_York.`,
      { field: "recurrence.timezone" }
    );
  }
}

/** Parsed options with the wall time pinned: dtstart is the anchor's wall clock. */
function build(rrule: string, timeZone: string, anchor: Date): RRule {
  const text = rrule.trim().replace(/^RRULE:/i, "");
  let options: Partial<Options>;
  try {
    options = RRule.parseString(text);
  } catch {
    throw new HubError(
      "INVALID",
      `recurrence.rrule: "${rrule}" is not a valid RRULE. Example: FREQ=WEEKLY;BYDAY=MO;BYHOUR=9.`,
      { field: "recurrence.rrule" }
    );
  }
  if (options.freq === undefined || !FREQUENCIES.includes(options.freq)) {
    throw new HubError(
      "INVALID",
      "recurrence.rrule: FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY.",
      { field: "recurrence.rrule" }
    );
  }
  const wall = wallClockAsUtc(anchor, timeZone);
  // BYHOUR alone means on the hour; with neither, keep the anchor's time of day.
  const hasHour = options.byhour != null;
  const hasMinute = options.byminute != null;
  const next: Partial<Options> = {
    ...options,
    dtstart: new Date(
      Date.UTC(
        wall.getUTCFullYear(),
        wall.getUTCMonth(),
        wall.getUTCDate(),
        wall.getUTCHours(),
        wall.getUTCMinutes(),
        0
      )
    ),
    tzid: null,
    bysecond: [0],
    byhour: hasHour ? options.byhour : [wall.getUTCHours()],
    byminute: hasMinute
      ? options.byminute
      : [hasHour ? 0 : wall.getUTCMinutes()],
  };
  return new RRule(next);
}

/** Throws INVALID unless the rule and zone are usable. */
export function assertRecurrence(rrule: string, timeZone: string) {
  assertTimeZone(timeZone);
  build(rrule, timeZone, new Date());
}

/**
 * The first occurrence strictly after `after`, as an instant; null when the
 * rule has no more (COUNT or UNTIL reached). `anchor` is the series' start,
 * which fixes the time of day when the rule names none and the first date of a
 * COUNT series; it is the creation time.
 */
export function nextOccurrence(
  rrule: string,
  timeZone: string,
  after: Date,
  anchor: Date = after
): Date | null {
  const rule = build(rrule, timeZone, anchor);
  let cursor = wallClockAsUtc(after, timeZone);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const wall = rule.after(cursor, false);
    if (!wall) return null;
    const instant = zonedWallToDate(wall, timeZone);
    // A skipped or repeated wall hour can map a wall time to or before `after`.
    if (instant.getTime() > after.getTime()) return instant;
    cursor = wall;
  }
  return null;
}

/** Plain-language form for the Repeats line, for example "every week on Monday at 09:00". */
export function describeRule(rrule: string, timeZone: string): string {
  try {
    const rule = build(rrule, timeZone, new Date());
    const hour = rule.options.byhour?.[0];
    const minute = rule.options.byminute?.[0] ?? 0;
    const text = rule.toText();
    const time =
      hour == null
        ? ""
        : ` at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return `${text}${time}`;
  } catch {
    return rrule;
  }
}
