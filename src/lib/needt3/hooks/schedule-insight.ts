"use client";

/**
 * The scheduler, shown rather than run: why a task is at its time, how full
 * each day is, and a what-if of a replan that is applied only when the
 * person says so (and can be undone). All three read the server; none of
 * them moves anything by itself.
 */
import { useCallback, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, sendJson } from "./core";

const LOG_SOURCE = "ScheduleInsight";
const PREVIEW_URL = "/api/tasks/reschedule-preview";

export interface ScheduleWhyFact {
  kind: string;
  label: string;
  text: string;
  decisive?: boolean;
}

export interface ScheduleWhy {
  taskId: string;
  status: "placed" | "unplaced" | "pinned" | "not-auto" | "not-in-plan";
  current: { start: string | null; end: string | null };
  planned: { start: string; end: string } | null;
  upToDate: boolean;
  atRisk: boolean;
  facts: ScheduleWhyFact[];
}

/** Loaded only while the disclosure is open: it runs a scheduling pass. */
export function useScheduleWhy(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.scheduleWhy(taskId),
    queryFn: () =>
      fetchJson<ScheduleWhy>(
        `/api/tasks/${encodeURIComponent(taskId)}/schedule-explanation`
      ),
    enabled: enabled && !!taskId,
    staleTime: 30_000,
    retry: false,
  });
}

export interface CapacityDay {
  date: string;
  workingMinutes: number;
  meetingMinutes: number;
  taskMinutes: number;
  outsideHoursMinutes: number;
  freeMinutes: number;
  plannedMinutes: number;
  overMinutes: number;
}

export interface ScheduleCapacity {
  workingMinutes: number;
  availableMinutes: number;
  overflowMinutes: number;
  days?: CapacityDay[];
}

/** Server capacity from today on (`days` includes today). */
export function useCapacity(days: number, enabled = true) {
  return useQuery({
    queryKey: qk.capacity(days),
    queryFn: () =>
      fetchJson<ScheduleCapacity>(`/api/tasks/capacity?days=${days}`),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export interface PreviewChange {
  taskId: string;
  title: string;
  fromStart: string | null;
  toStart: string | null;
  fromEnd: string | null;
  toEnd: string | null;
}

export interface PreviewLoadDay {
  date: string;
  beforeMinutes: number;
  afterMinutes: number;
}

export interface SchedulePreview {
  previewToken: string;
  changes: PreviewChange[];
  unscheduled: { taskId: string; title: string; reason: string }[];
  atRisk?: { taskId: string; title: string; deadline: string }[];
  load?: PreviewLoadDay[];
  /** The person's zone; times in the preview are read in it. */
  timeZone?: string;
}

interface ApplyReply {
  undoToken: string;
  changes: { taskId: string }[];
}

export type PreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; preview: SchedulePreview }
  | { phase: "applying"; preview: SchedulePreview }
  | { phase: "error"; message: string };

/**
 * What-if: ask where a fresh plan would put things, show it, and write it
 * only on Apply. Apply checks the schedule did not change since the preview
 * (409 otherwise) and returns an Undo that puts back exactly what moved.
 */
export function useSchedulePreview() {
  const qc = useQueryClient();
  const [state, setState] = useState<PreviewState>({ phase: "idle" });
  // Each open() gets a number; a reply for an older one (closed, or opened
  // again since) is dropped instead of reopening the sheet.
  const generation = useRef(0);
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.all() }),
    [qc]
  );

  const open = useCallback(async () => {
    const mine = ++generation.current;
    setState({ phase: "loading" });
    try {
      const preview = await sendJson<SchedulePreview>(PREVIEW_URL, "POST", {
        action: "preview",
      });
      if (mine !== generation.current) return;
      setState({ phase: "ready", preview });
    } catch (error) {
      if (mine !== generation.current) return;
      logger.warn(
        "Schedule preview failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setState({ phase: "error", message: "Could not work out a new plan." });
    }
  }, []);

  const close = useCallback(() => {
    generation.current += 1;
    setState({ phase: "idle" });
  }, []);

  const undo = useCallback(
    async (token: string) => {
      try {
        await sendJson(PREVIEW_URL, "POST", { action: "undo", token });
        await refresh();
        notify.success("Put back");
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        notify.warning(stale ? "Cannot undo that now" : "Could not undo", {
          description: stale
            ? "The schedule changed since. Move the tasks by hand."
            : undefined,
        });
      }
    },
    [refresh]
  );

  const apply = useCallback(async () => {
    if (state.phase !== "ready") return;
    const { preview } = state;
    setState({ phase: "applying", preview });
    try {
      const applied = await sendJson<ApplyReply>(PREVIEW_URL, "POST", {
        action: "apply",
        token: preview.previewToken,
      });
      setState({ phase: "idle" });
      await refresh();
      const n = applied.changes.length;
      notify.success(`Moved ${n} ${n === 1 ? "task" : "tasks"}`, {
        description: "As the preview showed.",
        duration: 12_000,
        action: { label: "Undo", onClick: () => void undo(applied.undoToken) },
      });
    } catch (error) {
      const stale = error instanceof ApiError && error.status === 409;
      if (stale) {
        // Something moved since the preview: show the plan as it is now.
        notify.warning("The schedule changed", {
          description: "Here is the plan again, as it is now.",
        });
        void open();
        return;
      }
      setState({ phase: "error", message: "Could not apply the plan." });
    }
  }, [open, refresh, state, undo]);

  return { state, open, close, apply };
}
