"use client";

import { useCallback } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import type { WeekFocus, WeekFocusItem } from "@/lib/needt3/week-focus";

import { fetchJson, sendJson } from "./core";

/**
 * THE WEEK'S FOCUSES (`/api/week-focus`). The up to three things a person
 * picked in the Sunday review; Home offers a task that matches one before any
 * other as the day's highlight. Stored per week, readable by anyone with API
 * access.
 */
interface Answer {
  weekFocus: WeekFocus | null;
}

export function useWeekFocus(weekStart: string, enabled = true) {
  return useQuery({
    queryKey: qk.weekFocus(weekStart),
    queryFn: async () =>
      (
        await fetchJson<Answer>(
          `/api/week-focus?weekStart=${encodeURIComponent(weekStart)}`
        )
      ).weekFocus ?? null,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Saves a week's focuses; the cache takes the answer. Resolves false when it failed. */
export function useSaveWeekFocus() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (v: { weekStart: string; focuses: WeekFocusItem[] }) =>
      (await sendJson<Answer>("/api/week-focus", "PUT", v)).weekFocus,
    onSuccess: (saved, v) => qc.setQueryData(qk.weekFocus(v.weekStart), saved),
  });
  return useCallback(
    (weekStart: string, focuses: WeekFocusItem[]) =>
      mutation.mutateAsync({ weekStart, focuses }).then(
        () => true,
        () => false
      ),
    [mutation]
  );
}
