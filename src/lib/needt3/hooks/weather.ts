"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

export interface Weather {
  city: string;
  temp: number;
  min: number;
  max: number;
  code: number;
  summary: string;
}

/**
 * Today's weather for the saved City (`GET /api/weather`, Open-Meteo through
 * the server; no device location). Asked only when a city is saved, and kept
 * for an hour; the city is part of the key, so a new one asks again. A failure
 * is just no weather.
 */
export function useWeather(city: string) {
  return useQuery({
    queryKey: [...qk.weather(), city],
    queryFn: async () =>
      (await fetchJson<{ weather: Weather | null }>("/api/weather")).weather ??
      null,
    enabled: city.trim() !== "",
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
