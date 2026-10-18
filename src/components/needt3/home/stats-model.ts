/**
 * Home's stats, pure: what the small card and the full view read off the
 * `/api/stats` answer.
 */
import type { Stats } from "@/services/stats/home-stats";

const LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const weekdayLong = (n: number) => LONG[n] ?? "";
export const weekdayShort = (n: number) => SHORT[n] ?? "";

/** The weekday of a "YYYY-MM-DD" (0 = Sunday). */
export const weekdayOf = (day: string) =>
  new Date(`${day}T00:00:00.000Z`).getUTCDay();

export interface Bar {
  key: string;
  /** 0..1 of the tallest bar; at least a sliver for a non-zero value. */
  h: number;
  value: number;
  best: boolean;
  label: string;
}

/** Bars for a list of values: heights against the tallest, the best marked. */
export function bars(
  items: readonly { key: string; value: number; label: string }[],
  bestKey: string | null
): Bar[] {
  const max = Math.max(0, ...items.map((i) => i.value));
  return items.map((i) => ({
    key: i.key,
    value: i.value,
    label: i.label,
    best: i.key === bestKey && i.value > 0,
    h: !max || !i.value ? 0 : Math.max(0.08, i.value / max),
  }));
}

/** The small card's seven bars (or the month's thirty). */
export const dayBars = (s: Stats): Bar[] =>
  bars(
    s.days.map((d) => ({
      key: d.date,
      value: d.done,
      label: weekdayShort(weekdayOf(d.date)),
    })),
    s.bestDay
  );

/** The seven weekdays, Monday first, the best one marked. */
export const weekdayBars = (s: Stats): Bar[] =>
  bars(
    [1, 2, 3, 4, 5, 6, 0].map((w) => ({
      key: String(w),
      value: s.byWeekday.find((x) => x.weekday === w)?.done ?? 0,
      label: weekdayShort(w),
    })),
    s.bestWeekday == null ? null : String(s.bestWeekday)
  );

/** Whether the small card has anything to say. */
export const hasStatsToShow = (s: Stats | undefined, streak: number) =>
  !!s && (s.total > 0 || streak > 0);

/** "Best day Tue", or "" when none was closed. */
export const bestDayLine = (s: Stats) =>
  s.bestDay ? `Best day ${weekdayShort(weekdayOf(s.bestDay))}` : "";

/** For a screen reader: "7 done this week. Mon 1, Tue 0, …". */
export const statsSummary = (s: Stats) =>
  `${s.total} done in the last ${s.days.length} days. ` +
  s.days
    .slice(-7)
    .map((d) => `${weekdayShort(weekdayOf(d.date))} ${d.done}`)
    .join(", ");
