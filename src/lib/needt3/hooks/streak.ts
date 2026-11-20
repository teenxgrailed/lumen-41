"use client";

import type { Streak } from "@/services/streak/streak";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/**
 * The day streak (`GET /api/streak`). `bust` is any number that changes when
 * the answer should (the count of closed tasks): a new value asks again while
 * the old numbers stay on screen.
 */
export function useStreak(bust: number) {
  return useQuery({
    queryKey: [...qk.streak(), bust],
    queryFn: () => fetchJson<Streak>("/api/streak"),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
