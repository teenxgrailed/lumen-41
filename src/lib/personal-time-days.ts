import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import type { PersonalOccurrence, PersonalTone } from "@/lib/personal-time";

/**
 * Personal time cut into days, for the screens that draw it (the calendar's
 * grid, Home's day, the phone). Pure: no database, no React.
 */

/** One block's stretch within one day, ready to draw. */
export interface DayBand {
  /** Unique per occurrence and day. */
  key: string;
  blockId: string;
  kind: string;
  title: string;
  emoji: string;
  tone: PersonalTone;
  /** The person's day, "YYYY-MM-DD". */
  date: string;
  /** Decimal hours from the start of the day, 0-24. */
  from: number;
  to: number;
  repeating: boolean;
  linked: boolean;
}

const hourFraction = (instant: Date, timeZone: string) => {
  const [h, m] = formatInTimeZone(instant, timeZone, "HH:mm")
    .split(":")
    .map(Number);
  return h + m / 60;
};

/** The calendar day after `day`, independent of any time zone. */
export function nextDay(day: string) {
  return newDate(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)) + 1
    )
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Occurrences cut into days (an overnight block shows on both) and grouped by
 * the person's day. The calendar and Home read this; nothing else clips.
 */
export function dayBands(
  occurrences: readonly PersonalOccurrence[],
  timeZone: string
): Map<string, DayBand[]> {
  const out = new Map<string, DayBand[]>();
  for (const occ of occurrences) {
    const lastDay = formatInTimeZone(
      newDate(occ.end.getTime() - 1),
      timeZone,
      "yyyy-MM-dd"
    );
    let day = occ.date;
    for (let guard = 0; guard < 32; guard += 1) {
      const dayStart = fromZonedTime(`${day}T00:00:00`, timeZone);
      const next = nextDay(day);
      const nextStart = fromZonedTime(`${next}T00:00:00`, timeZone);
      const from = occ.start > dayStart ? hourFraction(occ.start, timeZone) : 0;
      const to = occ.end < nextStart ? hourFraction(occ.end, timeZone) : 24;
      if (to > from) {
        const list = out.get(day) ?? [];
        list.push({
          key: `${occ.blockId}:${day}:${from}`,
          blockId: occ.blockId,
          kind: occ.kind,
          title: occ.title,
          emoji: occ.emoji,
          tone: occ.tone,
          date: day,
          from,
          to,
          repeating: occ.repeating,
          linked: occ.linked,
        });
        out.set(day, list);
      }
      if (day >= lastDay) break;
      day = next;
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.from - b.from);
  return out;
}

const clock = (hour: number) => {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** "13:00–14:00" for a band. */
export function bandTimeLabel(band: Pick<DayBand, "from" | "to">) {
  return `${clock(band.from)}–${band.to >= 24 ? "24:00" : clock(band.to)}`;
}

/**
 * Where a one-tap preset lands: the next half hour from now, today. When the
 * block would run past midnight it starts tomorrow at the preset's own hour.
 */
export function quickStart(
  now: Date,
  timeZone: string,
  minutes: number,
  presetAt: string
) {
  const day = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [h, m] = formatInTimeZone(now, timeZone, "HH:mm")
    .split(":")
    .map(Number);
  const rounded = Math.ceil((h * 60 + m + 1) / 30) * 30;
  if (rounded + minutes <= 24 * 60) {
    const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
    const mm = String(rounded % 60).padStart(2, "0");
    return fromZonedTime(`${day}T${hh}:${mm}:00`, timeZone);
  }
  return fromZonedTime(`${nextDay(day)}T${presetAt}:00`, timeZone);
}

/** Whether the half-open stretch [start, end) of a day touches any band. */
export function bandAt(
  bands: readonly DayBand[] | undefined,
  from: number,
  to: number
) {
  return bands?.find((band) => band.from < to && band.to > from) ?? null;
}
