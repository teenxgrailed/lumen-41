"use client";

import { formatInTimeZone } from "@/lib/date-utils";
import { hourOf } from "@/lib/needt3/derive";
import { useNow } from "@/lib/needt3/hooks/clock";
import { useTimeZone } from "@/lib/needt3/hooks/settings";

export interface PhoneClock {
  /** The person's day, "YYYY-MM-DD". */
  today: string;
  /** The clock as a decimal hour in their zone (14.5 = 14:30). */
  hour: number;
  now: Date;
}

/** The person's day and hour at `now` in `tz`. Pure, so a test can pin the clock. */
export function clockAt(now: Date, tz: string): PhoneClock {
  const stamp = formatInTimeZone(now, tz, "yyyy-MM-dd'T'HH:mm");
  return { today: stamp.slice(0, 10), hour: hourOf(stamp) ?? 0, now };
}

/**
 * The phone's clock: re-read once a minute and whenever the app comes back
 * (`useNow`), so the now line, "in 12 min" and the day itself stay true across
 * midnight and across a long sleep in the background.
 */
export function usePhoneClock(): PhoneClock {
  const tz = useTimeZone();
  return clockAt(useNow(), tz);
}
