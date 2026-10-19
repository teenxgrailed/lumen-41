/**
 * The weather and first-event line on Home, pure.
 */
import { hhmm, hourOf } from "@/lib/needt3/derive";
import type { V3Event } from "@/lib/needt3/map";

export interface WeatherView {
  city: string;
  temp: number;
  min: number;
  max: number;
  summary: string;
}

export interface FirstEvent {
  title: string;
  /** "10:00" */
  at: string;
}

/** The next timed event today that has not started, with when to leave. */
export function firstEvent(
  events: readonly V3Event[],
  today: string,
  nowHour: number
): FirstEvent | null {
  let best: { e: V3Event; h: number } | null = null;
  for (const e of events) {
    if (e.isAllDay || !e.startAt.startsWith(today)) continue;
    const h = hourOf(e.startAt);
    if (h == null || h < nowHour) continue;
    if (!best || h < best.h) best = { e, h };
  }
  if (!best) return null;
  return { title: best.e.title, at: hhmm(best.h) ?? "" };
}

/** "Kyiv · Partly cloudy 14° (9–17°)" */
export const weatherText = (w: WeatherView) =>
  `${w.city} · ${w.summary} ${w.temp}° (${w.min}–${w.max}°)`;

/** "First event at 10:00". There is no travel time to leave by, so none is shown. */
export const firstEventText = (f: FirstEvent) => `First event at ${f.at}`;

/**
 * The whole line. Hidden (null) while no city is saved, whatever else is
 * known; with a city, the weather and the first event, whichever there is.
 */
export function dayLine(o: {
  city: string;
  weather: WeatherView | null | undefined;
  first: FirstEvent | null;
}): string | null {
  if (!o.city.trim()) return null;
  const parts = [
    o.weather ? weatherText(o.weather) : "",
    o.first ? firstEventText(o.first) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
