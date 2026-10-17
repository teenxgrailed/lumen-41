/**
 * The one answer to "what day is it, and which week": the person's zone and
 * week start, for the desktop Home and the phone Home alike. Pure: `now` is
 * an argument, so a test pins the clock.
 */
import { formatInTimeZone } from "@/lib/date-utils";
import { addDays, daysBetween, weekday } from "@/lib/needt3/derive";

/** The person's day at `now`, "YYYY-MM-DD", in `tz`. */
export function dayAt(now: Date, tz: string): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

/**
 * The number of the week that holds `day`. A week runs from `startDay`
 * ("monday" or "sunday") and carries the number of the ISO week its Thursday
 * falls in, so Sun 11 - Sat 17 Oct 2026 and Mon 12 - Sun 18 Oct are both
 * week 42, whichever day the person starts on.
 */
export function weekNumber(day: string, startDay: string = "monday"): number {
  const back = startDay === "sunday" ? weekday(day) : (weekday(day) + 6) % 7;
  const first = addDays(day, -back);
  // Thursday of this week: 3 days after a Monday, 4 after a Sunday
  const thursday = addDays(first, startDay === "sunday" ? 4 : 3);
  const jan4 = `${thursday.slice(0, 4)}-01-04`;
  const firstThursday = addDays(jan4, 3 - ((weekday(jan4) + 6) % 7));
  return 1 + Math.round(daysBetween(firstThursday, thursday) / 7);
}

export interface TodayLine {
  day: string;
  /** "Saturday, 17 October" */
  date: string;
  week: number;
  /** "Saturday, 17 October · week 42" */
  line: string;
}

/** The Home header's date line for `now` in `tz`. */
export function todayLine(
  now: Date,
  tz: string,
  startDay: string = "monday"
): TodayLine {
  const day = dayAt(now, tz);
  const date = formatInTimeZone(now, tz, "EEEE, d MMMM");
  const week = weekNumber(day, startDay);
  return { day, date, week, line: `${date} · week ${week}` };
}
