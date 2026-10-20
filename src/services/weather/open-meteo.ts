import { logger } from "@/lib/logger";
import { type CityPlace, parseCityPlace } from "@/lib/needt3/city";

/**
 * Today's weather for the city a person typed in Settings, from Open-Meteo
 * (free, no key). Only the city name leaves the server; no device location is
 * ever asked for or sent. The city is geocoded once and remembered; the
 * forecast is cached for an hour.
 */

const LOG_SOURCE = "weather";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export const FORECAST_TTL_MS = 60 * 60 * 1000;
/** A city does not move; the geocode is kept for a month. */
export const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

export interface Place {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
}

export interface Weather {
  city: string;
  /** °C, rounded. */
  temp: number;
  min: number;
  max: number;
  /** WMO weather code. */
  code: number;
  /** "Partly cloudy". */
  summary: string;
}

/** A tiny TTL store; the default lives in this process. */
export interface WeatherCache {
  get(key: string): unknown;
  set(key: string, value: unknown, ttlMs: number): void;
}

export function memoryCache(now: () => number = Date.now): WeatherCache {
  const map = new Map<string, { value: unknown; until: number }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.until <= now()) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, ttlMs) {
      if (map.size > 500) map.clear();
      map.set(key, { value, until: now() + ttlMs });
    },
  };
}

const shared = memoryCache();

/** WMO weather interpretation codes, in a few plain words. */
export function describeWeather(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  return res.json();
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The city as typed, tidied: trimmed, one line, 80 characters at most. */
export const cleanCity = (raw: unknown) =>
  typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 80) : "";

/**
 * Type-ahead: up to 8 places matching what was typed. Only the typed query
 * leaves the server. Open-Meteo needs two characters at least.
 */
export async function searchCities(
  rawQuery: unknown,
  deps: { fetcher?: Fetcher; cache?: WeatherCache } = {}
): Promise<CityPlace[]> {
  const q = cleanCity(rawQuery);
  if (q.length < 2) return [];
  const cache = deps.cache ?? shared;
  const key = `cities:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit as CityPlace[];
  const body = (await getJson(
    deps.fetcher ?? fetch,
    `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`
  )) as { results?: Record<string, unknown>[] };
  const seen = new Set<string>();
  const places: CityPlace[] = [];
  for (const r of body.results ?? []) {
    const place = parseCityPlace({
      name: r.name,
      admin1: r.admin1,
      country: r.country,
      countryCode: r.country_code,
      latitude: r.latitude,
      longitude: r.longitude,
    });
    if (!place) continue;
    const id = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push(place);
  }
  cache.set(key, places, GEOCODE_TTL_MS);
  return places;
}

export async function geocode(
  city: string,
  deps: { fetcher?: Fetcher; cache?: WeatherCache } = {}
): Promise<Place | null> {
  const cache = deps.cache ?? shared;
  const key = `geo:${city.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit as Place | null;
  const body = (await getJson(
    deps.fetcher ?? fetch,
    `${GEOCODE_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  )) as { results?: Record<string, unknown>[] };
  const r = body.results?.[0];
  const latitude = num(r?.latitude);
  const longitude = num(r?.longitude);
  const place: Place | null =
    r && latitude != null && longitude != null
      ? {
          name: typeof r.name === "string" ? r.name : city,
          country: typeof r.country === "string" ? r.country : null,
          latitude,
          longitude,
        }
      : null;
  cache.set(key, place, GEOCODE_TTL_MS);
  return place;
}

/** Today's weather for a city, or null when it is unknown or the service is down. */
export async function weatherFor(
  rawCity: unknown,
  deps: {
    fetcher?: Fetcher;
    cache?: WeatherCache;
    place?: CityPlace | null;
  } = {}
): Promise<Weather | null> {
  const city = cleanCity(rawCity);
  if (!city) return null;
  const cache = deps.cache ?? shared;
  try {
    // A picked city carries its coordinates; only a typed name is geocoded.
    const place = deps.place ?? (await geocode(city, deps));
    if (!place) return null;
    const key = `wx:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
    const hit = cache.get(key) as Omit<Weather, "city"> | undefined;
    if (hit) return { city: place.name, ...hit };
    const body = (await getJson(
      deps.fetcher ?? fetch,
      `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,weather_code" +
        "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto"
    )) as {
      current?: { temperature_2m?: unknown; weather_code?: unknown };
      daily?: {
        temperature_2m_max?: unknown[];
        temperature_2m_min?: unknown[];
      };
    };
    const temp = num(body.current?.temperature_2m);
    const code = num(body.current?.weather_code);
    const max = num(body.daily?.temperature_2m_max?.[0]);
    const min = num(body.daily?.temperature_2m_min?.[0]);
    if (temp == null || code == null) return null;
    const value = {
      temp: Math.round(temp),
      min: Math.round(min ?? temp),
      max: Math.round(max ?? temp),
      code,
      summary: describeWeather(code),
    };
    cache.set(key, value, FORECAST_TTL_MS);
    return { city: place.name, ...value };
  } catch (error) {
    logger.warn(
      "Weather lookup failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
  }
}
