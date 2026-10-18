"use client";

import type { Stats, StatsRange } from "@/services/stats/home-stats";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/**
 * What the person closed over the last week or month (`GET /api/stats`).
 * `bust` is any number that changes when the answer should (the count of
 * closed tasks): a new value asks again while the old numbers stay on screen.
 */
export function useStats(
  range: StatsRange,
  bust: number,
  opts: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: [...qk.stats(range), bust],
    queryFn: () => fetchJson<Stats>(`/api/stats?range=${range}`),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
