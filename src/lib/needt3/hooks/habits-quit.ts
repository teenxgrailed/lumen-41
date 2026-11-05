"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  HabitEvent,
  HabitEventType,
  QuitGate,
  QuitSummary,
} from "@/lib/needt3/habits-quit";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, isUpgradeRequired, sendJson } from "./core";
import { useHabits } from "./habits";

/**
 * Whether Quit habits show for this account, read off GET /api/habits
 * (`useHabits` stores it). "off" until that read lands, and on a server that
 * does not send the field: the feature never flashes in.
 */
export function useQuitGate(): QuitGate {
  useHabits();
  const { data } = useQuery<QuitGate>({
    queryKey: qk.quitGate(),
    queryFn: () => "off",
    staleTime: Infinity,
    enabled: false,
  });
  return data ?? "off";
}

/** Streaks, clean days and counts (GET /api/habits/:id/quit-summary). */
export function useQuitSummary(habitId: string | null) {
  return useQuery({
    queryKey: qk.quitSummary(habitId ?? ""),
    enabled: Boolean(habitId),
    queryFn: async () =>
      (
        await fetchJson<{ summary: QuitSummary }>(
          `/api/habits/${habitId}/quit-summary`
        )
      ).summary,
  });
}

/** The event log, newest first: enough for seven days of pulls and the eight-week map. */
export function useHabitEvents(habitId: string | null) {
  return useQuery({
    queryKey: qk.habitEvents(habitId ?? ""),
    enabled: Boolean(habitId),
    queryFn: async () =>
      (
        await fetchJson<{ events: HabitEvent[] }>(
          `/api/habits/${habitId}/events?limit=200`
        )
      ).events,
  });
}

export interface LogEventVars {
  habitId: string;
  type: HabitEventType;
  tag?: string | null;
  intensity?: number | null;
  note?: string | null;
}

const WRITE_FAILED: Partial<Record<HabitEventType, string>> = {
  URGE: "Could not log the pull. It is not counted.",
  RESISTED: "Could not save the held pull. Try once more.",
  RELAPSE: "Could not start again. Try once more.",
};

/**
 * Log a pull, a held pull or a slip (POST /api/habits/:id/events). The list
 * gets the row at once; the summary is read again after the write, since a
 * slip moves the run.
 *
 * Failures are told here, on the mutation itself, not in a per-call
 * callback: the pull flow often closes before the write lands, and a
 * callback passed to `mutate` is dropped once its component unmounts. A 403
 * means the plan changed under a stale gate: the habits read is refreshed
 * (it carries the gate) and the person is told what changed.
 */
export function useLogHabitEvent() {
  const qc = useQueryClient();
  return useMutation({
    onError: (error, vars) => {
      if (isUpgradeRequired(error)) {
        void qc.invalidateQueries({ queryKey: qk.habits() });
        notify.info("New pulls need Pro. What you logged stays readable.");
        return;
      }
      const line = WRITE_FAILED[vars.type];
      if (line) notify.error(line);
    },
    mutationFn: async ({ habitId, ...event }: LogEventVars) =>
      (
        await sendJson<{ event: HabitEvent }>(
          `/api/habits/${habitId}/events`,
          "POST",
          event
        )
      ).event,
    onSuccess: (event) => {
      qc.setQueryData<HabitEvent[]>(qk.habitEvents(event.habitId), (list) =>
        list ? [event, ...list] : list
      );
    },
    onSettled: (_r, _e, vars) => {
      void qc.invalidateQueries({ queryKey: qk.quitSummary(vars.habitId) });
    },
  });
}

export interface PatchEventVars {
  habitId: string;
  eventId: string;
  tag?: string | null;
  intensity?: number | null;
  note?: string | null;
}

/**
 * Add the trigger, strength or a note to a pull already logged
 * (PATCH /api/habits/:id/events/:eventId). A server without the route
 * answers 404 or 405; the pull itself is already saved, so that is not an
 * error the person needs to see.
 */
export function usePatchHabitEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ habitId, eventId, ...patch }: PatchEventVars) => {
      try {
        return (
          await sendJson<{ event: HabitEvent }>(
            `/api/habits/${habitId}/events/${eventId}`,
            "PATCH",
            patch
          )
        ).event;
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 404 || error.status === 405)
        )
          return null;
        throw error;
      }
    },
    onSuccess: (event, vars) => {
      if (!event) return;
      qc.setQueryData<HabitEvent[]>(qk.habitEvents(vars.habitId), (list) =>
        list?.map((e) => (e.id === event.id ? event : e))
      );
    },
  });
}
