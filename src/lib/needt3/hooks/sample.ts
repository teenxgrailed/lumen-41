"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/**
 * First-run examples (`/api/onboarding/sample`): whether any are left, and
 * the one action that removes them all. The banner on Today and the row in
 * Settings, Data read the same query, so clearing from one hides the other.
 */

export interface SampleCounts {
  tasks: number;
  projects: number;
  pages: number;
  habits: number;
}

export interface SampleStatus {
  present: boolean;
  counts: SampleCounts;
}

const KEEP_MS = 5 * 60_000;

export function useSampleStatus() {
  return useQuery({
    queryKey: qk.sample(),
    queryFn: () => fetchJson<SampleStatus>("/api/onboarding/sample"),
    staleTime: KEEP_MS,
    // A failed read just means no banner; never an error on Today.
    retry: false,
  });
}

export function useClearSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      sendJson<{ removed: SampleCounts }>("/api/onboarding/sample", "DELETE"),
    onSuccess: async () => {
      qc.setQueryData<SampleStatus>(qk.sample(), {
        present: false,
        counts: { tasks: 0, projects: 0, pages: 0, habits: 0 },
      });
      // Tasks, projects, habits and documents all lost rows.
      await qc.invalidateQueries({ queryKey: qk.all() });
      notify.success("Examples cleared. Your own tasks are untouched.");
    },
    onError: (error) =>
      notify.error(
        error instanceof Error ? error.message : "Could not clear the examples."
      ),
  });
}
