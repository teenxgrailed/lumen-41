/**
 * What the new Home pieces draw, from what the app already holds: habits with
 * their check-ins, the saved city's weather, the time-left numbers and the
 * tasks. Pure; the pieces take plain props and know nothing of the stores.
 */
import type { Stats } from "@/services/stats/home-stats";

import { clock } from "@/lib/needt3/day";
import {
  type Checkin,
  addDays,
  daysBetween,
  habitDoneOn,
  habitWeek,
  liveHabits,
} from "@/lib/needt3/derive";
import type { Weather } from "@/lib/needt3/hooks/weather";
import type { V3Habit, V3Task } from "@/lib/needt3/map";
import { weekStartOf } from "@/lib/needt3/week-focus";
import type { PersonalTone } from "@/lib/personal-time";
import { type DayBand, bandTimeLabel } from "@/lib/personal-time-days";

import type { FirstEvent } from "../day-line-model";
import { type ScheduleItem, dur, hourAt } from "../derive";
import { type FinishPick, finishHeadline, restLine } from "../finish";
import { hasStatsToShow, weekdayOf, weekdayShort } from "../stats-model";
import type { TimeLeft } from "../timeleft";
import type { HaPull } from "./HaAllDone";
import type { HaHabit } from "./HaHabits";
import type { HaCard } from "./HaHighlight";
import type { HaTime } from "./HaTimeLeft";
import type { HaBandData, HaTimelineRow } from "./HaTimeline";
import type { HaWx, HaWxDetail } from "./HaWeather";
import type { HaWeekData } from "./HaWeek";

const EMOJI = /^\p{Extended_Pictographic}/u;

/** The habit's emoji (`Habit.icon`); anything else is no emoji and draws the glyph. */
export function habitEmoji(icon: string | null | undefined): string {
  const t = (icon ?? "").trim();
  return t && EMOJI.test(t) ? t : "";
}

/**
 * The habits row: kept today, and for "N times a week" habits the count of the
 * last seven days against the target. Only fewer-than-daily targets are weekly.
 */
export function haHabitsOf(
  habits: readonly V3Habit[],
  checkins: readonly Checkin[],
  today: string
): HaHabit[] {
  return liveHabits(habits).map((h) => {
    const target = h.schedule.perWeek;
    const weekly = !!target && target < 7;
    return {
      id: h.id,
      name: h.title,
      emoji: habitEmoji(h.icon),
      kind: weekly ? "week" : "daily",
      ...(weekly
        ? { target, count: Math.min(target, habitWeek(h.id, checkins, today)) }
        : {}),
      done: habitDoneOn(h.id, today, checkins),
    };
  });
}

/** An emoji for a WMO weather code (Open-Meteo). */
export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫";
  if (code >= 51 && code <= 57) return "🌦";
  if (code >= 61 && code <= 67) return "🌧";
  if (code >= 71 && code <= 77) return "🌨";
  if (code >= 80 && code <= 82) return "🌦";
  if (code === 85 || code === 86) return "🌨";
  if (code >= 95) return "⛈";
  return "";
}

/** The hover card under the weather: what the one-line summary leaves out. */
export function haWeatherDetail(w: Weather): HaWxDetail {
  const rows: HaWxDetail["rows"] = [
    { k: "Feels like", v: `${w.feelsLike}°` },
    { k: "High / low", v: `${w.max}° / ${w.min}°` },
  ];
  if (w.precipChance != null)
    rows.push({ k: "Precipitation", v: `${w.precipChance}%` });
  if (w.windKph != null) rows.push({ k: "Wind", v: `${w.windKph} km/h` });
  if (w.sunrise) rows.push({ k: "Sunrise", v: w.sunrise });
  if (w.sunset) rows.push({ k: "Sunset", v: w.sunset });
  return {
    place: w.city,
    summary: w.summary,
    rows,
    hours: (w.hours ?? []).map((h) => ({
      time: h.time,
      ic: weatherEmoji(h.code),
      t: `${h.temp}°`,
    })),
  };
}

/**
 * The weather and first-event line. Hidden without a saved city; with one,
 * whichever of the weather and the first event is known.
 */
export function haWeatherOf(o: {
  city: string;
  weather: Weather | null | undefined;
  first: FirstEvent | null;
}): HaWx | null {
  if (!o.city.trim()) return null;
  const w = o.weather;
  const wx: HaWx = {
    ...(w
      ? {
          ic: weatherEmoji(w.code),
          t: `${w.temp}°`,
          d: w.summary.toLocaleLowerCase(),
          detail: haWeatherDetail(w),
        }
      : {}),
    ...(o.first ? { first: o.first.at } : {}),
  };
  return wx.t || wx.first ? wx : null;
}

/**
 * The time-left bar on the working day: what is behind (ink), what is still
 * planned (mark), where now is. `start` and `end` are the day's work hours
 * (decimal), `nowHour` the clock.
 */
export function haTimeOf(o: {
  left: TimeLeft | null;
  nowHour: number;
  start: number;
  end: number;
}): HaTime | null {
  const { left } = o;
  const span = o.end - o.start;
  if (!left || span <= 0) return null;
  const now = Math.min(1, Math.max(0, (o.nowHour - o.start) / span));
  const planned = dur(left.planned) || "0 min";
  const plan = left.over
    ? 1 - now
    : Math.min(1 - now, left.planned / (span * 60));
  return {
    planned,
    ...(left.over
      ? {
          over: { by: dur(left.overBy) || "0 min", ends: clock(o.end) },
          overFrac: Math.min(1, left.overBy / (span * 60)),
        }
      : { free: dur(left.free - left.planned) || "0 min" }),
    ends: clock(o.end),
    dayMinutes: span * 60,
    used: now,
    plan,
    now,
  };
}

/** The brief's text as its lines (the model writes two or three). */
export const briefLines = (text: string | null | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** The card's time and length for a task: its hour when it has one. */
export function haTaskCard(t: V3Task, today: string, sub: string): HaCard {
  const at = hourAt(t, today);
  return {
    id: t.id,
    title: t.title,
    ...(at != null ? { time: clock(at) } : {}),
    ...(t.estimatedMinutes ? { dur: dur(t.estimatedMinutes) } : {}),
    sub,
  };
}

/**
 * The This week card for the calendar week that holds today (from the week's
 * first day to its last): seven bars against the busiest day, today marked,
 * days to come left empty. Null when there is nothing to show yet.
 */
export function haWeekOf(o: {
  stats: Stats | undefined;
  today: string;
  /** "monday" or "sunday". */
  startDay: string;
  /** Days in a row with something closed. */
  streak: number;
}): HaWeekData | null {
  const s = o.stats;
  if (!s || !hasStatsToShow(s, o.streak)) return null;
  const first = weekStartOf(o.today, o.startDay);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const done = dates.map((d) => s.days.find((x) => x.date === d)?.done ?? 0);
  const max = Math.max(0, ...done);
  const bestAt = max > 0 ? done.indexOf(max) : -1;
  return {
    done: done.reduce((a, b) => a + b, 0),
    bars: done.map((n) => (max ? n / max : 0)),
    labels: dates.map((d) => weekdayShort(weekdayOf(d)).slice(0, 1)),
    today: daysBetween(first, o.today),
    best:
      bestAt >= 0
        ? `${weekdayShort(weekdayOf(dates[bestAt] as string))} · ${max}`
        : "—",
    streak: o.streak,
  };
}

/** A personal block's tone as a colour of the palette (a token, never a raw hex). */
const TONE_HUE: Record<PersonalTone, string> = {
  info: "var(--info)",
  success: "var(--success)",
  neutral: "var(--text-tertiary)",
};

/** A personal block of the day as the band the timeline draws. */
export function haBandOf(b: DayBand): HaBandData {
  return {
    e: b.emoji,
    n: b.title,
    time: bandTimeLabel(b),
    hue: TONE_HUE[b.tone] ?? TONE_HUE.neutral,
    blockId: b.blockId,
    band: b,
  };
}

/**
 * The day's timeline: timed tasks, events and personal blocks together by hour,
 * the now line above the first row still ahead (or alone at the end when the
 * day is past every row). Events and tasks keep their rail colour; a block is
 * a band, never a task row.
 */
export function haScheduleRows(o: {
  items: readonly ScheduleItem[];
  bands: readonly DayBand[];
  nowHour: number;
  hueOf: (projectId: string | null) => string;
}): HaTimelineRow[] {
  type Entry = { at: number; row: HaTimelineRow };
  const entries: Entry[] = [
    ...o.items.map<Entry>((x) => ({
      at: x.at,
      row: {
        key: x.key,
        t: clock(x.at),
        task: {
          id: x.id,
          title: x.title,
          c: x.event ? "var(--fill-5)" : o.hueOf(x.projectId),
          d: dur(x.len),
          event: x.event,
          done: x.done,
          past: x.at + x.len / 60 <= o.nowHour,
        },
      },
    })),
    ...o.bands.map<Entry>((b) => ({
      at: b.from,
      row: { key: `band:${b.key}`, t: clock(b.from), band: haBandOf(b) },
    })),
  ].sort((a, b) => a.at - b.at);
  const rows = entries.map((e) => e.row);
  const nowAt = entries.findIndex((e) => e.at > o.nowHour);
  if (nowAt >= 0) {
    const r = rows[nowAt];
    if (r) rows[nowAt] = { ...r, now: true };
  } else if (rows.length) {
    rows.push({ key: "now", t: clock(o.nowHour), now: true, bare: true });
  }
  return rows;
}

/**
 * What the all-done card says: its title (the day is done only when nothing
 * Home lists is still open), the counts line, and the tasks it offers to pull
 * in with the free time they fit in.
 */
export function haAllDoneOf(o: {
  count: number;
  /** Focus minutes today, when any were stored. */
  focusMinutes: number | null | undefined;
  open: { late: number; inbox: number };
  picks: readonly FinishPick[];
  freeMinutes: number | null;
}): { title: string; meta: string; pull: HaPull[]; free?: string } {
  const head = finishHeadline(o.open);
  const meta = [
    `${o.count} of ${o.count}`,
    o.focusMinutes ? `${dur(o.focusMinutes)} focused` : "",
    restLine(o.open),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: head.title,
    meta,
    pull: o.picks.map((p) => ({
      id: p.task.id,
      title: p.task.title,
      when: p.meta,
    })),
    ...(o.freeMinutes ? { free: dur(o.freeMinutes) } : {}),
  };
}
