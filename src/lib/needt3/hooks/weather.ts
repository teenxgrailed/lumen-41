"use client";

import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { type CityPlace, parseCityPlace } from "@/lib/needt3/city";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";
import { useSettings } from "./settings";

export interface Weather {
  city: string;
  temp: number;
  min: number;
  max: number;
  code: number;
  summary: string;
  feelsLike: number;
  precipChance: number | null;
  windKph: number | null;
  sunrise: string | null;
  sunset: string | null;
  hours: {
    time: string;
    temp: number;
    code: number;
    precipChance: number | null;
  }[];
}

/**
 * Today's weather for the saved City (`GET /api/weather`, Open-Meteo through
 * the server; no device location). Asked only when a city is saved, and kept
 * for an hour; the city and its coordinates are part of the key, so a new one
 * asks again. A failure is just no weather.
 */
export function useWeather(city: string) {
  const place = parseCityPlace(useSettings().data?.prefs.cityPlace);
  return useQuery({
    queryKey: [
      ...qk.weather(),
      city,
      place ? `${place.latitude},${place.longitude}` : "",
    ],
    queryFn: async () =>
      (await fetchJson<{ weather: Weather | null }>("/api/weather")).weather ??
      null,
    enabled: city.trim() !== "",
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export const CITY_SEARCH_MIN = 2;
const CITY_SEARCH_DELAY_MS = 250;

/**
 * Suggestions for what is typed in the City picker (`GET /api/weather/cities`).
 * Debounced, so a burst of keys is one request; under two characters asks
 * nothing. The browser only ever talks to our own server.
 */
export function useCitySearch(typed: string) {
  const q = typed.replace(/\s+/g, " ").trim();
  const [settled, setSettled] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setSettled(q), CITY_SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [q]);
  const enabled = settled.length >= CITY_SEARCH_MIN;
  const query = useQuery({
    queryKey: [...qk.weather(), "cities", settled.toLowerCase()],
    queryFn: async ({ signal }) =>
      (
        await fetchJson<{ cities: CityPlace[] }>(
          `/api/weather/cities?q=${encodeURIComponent(settled)}`,
          { signal }
        )
      ).cities,
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  return {
    cities: enabled ? (query.data ?? []) : [],
    /** Typing has outrun the request, or the request is out. */
    searching:
      q.length >= CITY_SEARCH_MIN && (q !== settled || query.isFetching),
    failed: enabled && query.isError,
    asked: enabled && q === settled && query.isSuccess,
  };
}
