/**
 * The End day nudge, pure: when the last half hour of today's working hours
 * is on, and the small per-day memory that keeps it from nagging.
 */
import type { WorkHours } from "../calendar/strip";

/** How long before the end of work the nudge shows. */
export const NUDGE_LEAD_HOURS = 0.5;

/** The end of today's last working range (decimal hour), or null on a day off or with no hours. */
export function workEndToday(
  work: WorkHours | null | undefined,
  weekday: number
): number | null {
  if (!work) return null;
  if (work.byDay) {
    const ranges = work.byDay[weekday] ?? [];
    return ranges.length ? Math.max(...ranges.map((r) => r[1])) : null;
  }
  return work.days.includes(weekday) ? work.end : null;
}

/** True in the last 30 minutes of working hours, up to the end itself. */
export function inNudgeWindow(nowHour: number, endHour: number | null) {
  return (
    endHour != null &&
    nowHour >= endHour - NUDGE_LEAD_HOURS &&
    nowHour < endHour
  );
}

const key = (day: string) => `needt.endday.nudge.${day}`;

/** Whether the nudge was dismissed, or End day was run, on this day. */
export function nudgeOff(day: string): boolean {
  try {
    return window.localStorage.getItem(key(day)) === "1";
  } catch {
    return false;
  }
}

export function setNudgeOff(day: string) {
  try {
    window.localStorage.setItem(key(day), "1");
  } catch {
    // the nudge may come back on a reload; that is all
  }
}
