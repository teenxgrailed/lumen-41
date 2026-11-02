/**
 * Time-zone arithmetic for send windows. Pure and DST-safe: every answer is
 * found by looking at the wall clock of an instant in the person's IANA zone,
 * never by adding a fixed offset.
 */

import { newDate } from "@/lib/date-utils";

export type LocalParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Whether a string is a time zone the runtime knows. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone to use: the stored one, or UTC when it is not valid. */
export function safeTimeZone(zone: string | null | undefined): {
  zone: string;
  invalid: boolean;
} {
  const value = (zone ?? "").trim();
  if (value && isValidTimeZone(value)) return { zone: value, invalid: false };
  return { zone: "UTC", invalid: true };
}

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

export function localParts(date: Date, zone: string): LocalParts {
  const out: Record<string, string> = {};
  for (const part of formatterFor(zone).formatToParts(date)) {
    out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

/** "HH:MM" to minutes since midnight; null when malformed. */
export function minutesOfDay(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export type SendWindow = {
  /** Local start of the allowed hours, minutes since midnight. */
  startMinute: number;
  /** Local end (exclusive), minutes since midnight. */
  endMinute: number;
  /** Allow Saturday and Sunday. */
  weekends: boolean;
  /** The person's own notification quiet hours, never entered. */
  quiet?: { startMinute: number; endMinute: number } | null;
};

/** Optional mail: 09:00 to 19:00 on weekdays. */
export const STANDARD_WINDOW = {
  startMinute: 9 * 60,
  endMinute: 19 * 60,
  weekends: false,
} as const;

function inQuiet(
  minute: number,
  quiet: { startMinute: number; endMinute: number }
): boolean {
  if (quiet.startMinute === quiet.endMinute) return false;
  return quiet.startMinute < quiet.endMinute
    ? minute >= quiet.startMinute && minute < quiet.endMinute
    : minute >= quiet.startMinute || minute < quiet.endMinute;
}

/** Whether `at` is a moment mail may be sent, in the person's zone. */
export function isInWindow(at: Date, zone: string, window: SendWindow): boolean {
  const parts = localParts(at, zone);
  if (!window.weekends && (parts.weekday === 0 || parts.weekday === 6)) {
    return false;
  }
  const minute = parts.hour * 60 + parts.minute;
  if (minute < window.startMinute || minute >= window.endMinute) return false;
  if (window.quiet && inQuiet(minute, window.quiet)) return false;
  return true;
}

const STEP_MS = 15 * 60_000;

/**
 * The first instant at or after `from` (on a quarter-hour grid) that is inside
 * the window. Looks ten days ahead; null when the window can never be met
 * (for example quiet hours covering the whole day).
 */
export function nextWindowStart(
  from: Date,
  zone: string,
  window: SendWindow
): Date | null {
  const first = Math.ceil(from.getTime() / STEP_MS) * STEP_MS;
  const limit = 10 * 24 * 4;
  for (let i = 0; i < limit; i += 1) {
    const candidate = newDate(first + i * STEP_MS);
    if (isInWindow(candidate, zone, window)) return candidate;
  }
  return null;
}

/** Offset of `zone` from UTC at `date`, in minutes (east is positive). */
function offsetMinutes(date: Date, zone: string): number {
  const p = localParts(date, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** The UTC instant at which the wall clock in `zone` reads this time. */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  zone: string
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = offsetMinutes(newDate(guess), zone);
  let time = guess - first * 60_000;
  const second = offsetMinutes(newDate(time), zone);
  if (second !== first) time = guess - second * 60_000;
  return newDate(time);
}

/**
 * The first weekday (Monday to Friday) of the month that `at` falls in, at
 * `hour:00` local time, as a UTC instant.
 */
export function firstWeekdayOfMonth(at: Date, zone: string, hour: number): Date {
  const parts = localParts(at, zone);
  for (let day = 1; day <= 7; day += 1) {
    const noon = zonedTimeToUtc(
      { year: parts.year, month: parts.month, day, hour: 12, minute: 0 },
      zone
    );
    const weekday = localParts(noon, zone).weekday;
    if (weekday !== 0 && weekday !== 6) {
      return zonedTimeToUtc(
        { year: parts.year, month: parts.month, day, hour, minute: 0 },
        zone
      );
    }
  }
  return zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: 1, hour, minute: 0 },
    zone
  );
}

/** "YYYY-MM" of the local month containing `at`. */
export function localMonthKey(at: Date, zone: string): string {
  const p = localParts(at, zone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}
