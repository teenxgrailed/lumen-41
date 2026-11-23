"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import {
  type CloseBody,
  type DayPlanSnapshot,
  isOverflow,
  isPlanOff,
  planPickIds,
} from "@/lib/needt3/day-plan";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

const LOG_SOURCE = "DayPlanHooks";

/**
 * THE DAY PLAN (phone Today). The server owns the plan (`/api/day-plan`); this
 * reads today's, asks for a draft once when there is none, and closes the day
 * in the evening. When the server says the plan is switched off (the
 * `day_plan` kill switch answers 404 "disabled" to every write) the screens
 * fall back to the old Today and End day.
 */

/* The kill switch, as the client learns it: once per page load. */
let planOff = false;
const offListeners = new Set<() => void>();
const markPlanOff = () => {
  if (planOff) return;
  planOff = true;
  offListeners.forEach((l) => l());
};
const subscribeOff = (l: () => void) => {
  offListeners.add(l);
  return () => void offListeners.delete(l);
};

/** Test seam: forget what this page learned about the kill switch. */
export const resetDayPlanOff = () => {
  planOff = false;
  offListeners.forEach((l) => l());
};

export function useDayPlanOff(): boolean {
  return useSyncExternalStore(
    subscribeOff,
    () => planOff,
    () => false
  );
}

const reload = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: qk.dayPlan() });
  void qc.invalidateQueries({ queryKey: qk.tasks() });
  void qc.invalidateQueries({ queryKey: qk.someday() });
};

/** The snapshot of a date: its plan, the settings, what needs a decision. */
export function useDayPlan(date: string, enabled = true) {
  return useQuery({
    queryKey: qk.dayPlan(date),
    queryFn: () =>
      fetchJson<DayPlanSnapshot>(
        `/api/day-plan?date=${encodeURIComponent(date)}`
      ),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Today's plan. With none yet, a draft is requested once for the day and drawn
 * when it arrives. `off` is true once the server has said the plan is off.
 */
export function useDayPlanToday(today: string) {
  const qc = useQueryClient();
  const off = useDayPlanOff();
  const query = useDayPlan(today, !off);
  const asked = useRef<string | null>(null);
  const noPlan = query.isSuccess && !query.data.plan;

  useEffect(() => {
    if (off || !noPlan || asked.current === today) return;
    asked.current = today;
    sendJson<{ plan: NonNullable<DayPlanSnapshot["plan"]> }>(
      "/api/day-plan/draft",
      "POST",
      { date: today }
    )
      .then((r) => {
        qc.setQueryData<DayPlanSnapshot>(qk.dayPlan(today), (s) =>
          s ? { ...s, plan: r.plan } : s
        );
      })
      .catch((error: unknown) => {
        if (isPlanOff(error)) markPlanOff();
        else
          logger.warn(
            "Draft plan failed",
            { error: String(error) },
            LOG_SOURCE
          );
      });
  }, [off, noPlan, today, qc]);

  return { off, snapshot: off ? undefined : query.data, query };
}

/**
 * Today's plan picks for the counters (`planPickIds`), read without drafting
 * a plan: the Calendar and the menu count the day the way Home does, and only
 * Home asks for a draft. Shares the day's query with `useDayPlanToday`.
 */
export function usePlanPickIds(today: string): ReadonlySet<string> {
  const off = useDayPlanOff();
  const query = useDayPlan(today, !off);
  const data = off ? undefined : query.data;
  return useMemo(() => planPickIds(data), [data]);
}

export type CloseOutcome = "closed" | "overflow" | "off" | "error";

/**
 * Closes the day: the evening note (if any) becomes tomorrow's draft first,
 * then the day is closed with one resolution per leftover. The server does the
 * moving; there is no undo for a closed day, so none is offered.
 */
export function useCloseDay() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const close = useCallback(
    async (o: {
      body: CloseBody;
      tomorrow: string;
      note: string;
    }): Promise<CloseOutcome> => {
      if (going.current) return "error";
      going.current = true;
      setBusy(true);
      try {
        const note = o.note.trim();
        if (note) {
          try {
            await sendJson("/api/day-plan/draft", "POST", {
              date: o.tomorrow,
              note,
            });
          } catch (error) {
            if (isPlanOff(error)) {
              markPlanOff();
              return "off";
            }
            logger.warn(
              "Evening note draft failed",
              { error: String(error) },
              LOG_SOURCE
            );
            notify.warning("The note was kept, but it did not become tasks.");
          }
        }
        await sendJson("/api/day-plan/close", "POST", o.body);
        reload(qc);
        return "closed";
      } catch (error) {
        if (isPlanOff(error)) {
          markPlanOff();
          return "off";
        }
        if (isOverflow(error)) return "overflow";
        logger.warn("Close day failed", { error: String(error) }, LOG_SOURCE);
        notify.error("The day could not be closed. Try again.");
        return "error";
      } finally {
        going.current = false;
        setBusy(false);
      }
    },
    [qc]
  );

  return { close, busy };
}

export interface SomedayRow {
  id: string;
  title: string;
  somedayAt: string;
  reason: string | null;
  cleanupDue: boolean;
}

/** The Someday list (`GET /api/someday`). */
export function useSomeday(enabled = true) {
  return useQuery({
    queryKey: qk.someday(),
    queryFn: () =>
      fetchJson<{ items: SomedayRow[]; cleanupCount: number }>("/api/someday"),
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}

/** Return Someday tasks to the normal lists. */
export function useRestoreSomeday() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const restore = useCallback(
    async (taskIds: string[]) => {
      if (!taskIds.length) return false;
      setBusy(true);
      try {
        await sendJson("/api/someday/restore", "POST", { taskIds });
        reload(qc);
        return true;
      } catch (error) {
        if (isPlanOff(error)) markPlanOff();
        else notify.error("That task could not be returned. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [qc]
  );
  return { restore, busy };
}
