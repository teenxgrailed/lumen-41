"use client";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

/** The person's day ("YYYY-MM-DD") at `now`, in `tz`. Pure, so a test can pin the day. */
export function dayIn(now: Date, tz: string): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

/**
 * The person's today, in their saved time zone. Read at render; an overlay is
 * open for seconds, and a screen that stays open across midnight re-reads it
 * on its next render.
 */
export function usePkToday(): string {
  return dayIn(newDate(), useTimeZone());
}
