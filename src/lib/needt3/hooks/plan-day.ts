"use client";

import { useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { NEEDT_SCHEDULE_CHANGED_EVENT } from "@/lib/needt-events";
import { notify } from "@/lib/notifications";

import { ApiError, sendJson } from "./core";

/**
 * PLAN MY DAY. The real scheduler, through the route Ask already uses
 * (`/api/tasks/reschedule-preview`): preview what the engine would place,
 * apply it in one go, and keep the undo token so one Undo puts every task
 * back. The engine places tasks that have Auto-schedule on; a day with
 * nothing to place says so rather than claiming a plan.
 */

interface PlanChange {
  taskId: string;
  toStart: string | null;
}

interface PreviewResponse {
  changes: PlanChange[];
  previewToken: string;
}

interface ApplyResponse {
  changes: PlanChange[];
  undoToken: string;
}

export interface PlanOutcome {
  /** Tasks the plan gives a time (new or moved). */
  placed: number;
  /** Tasks the engine could not fit anywhere. */
  unplaced: number;
}

/** What a set of changes amounts to, in the person's terms. */
export function planOutcome(changes: readonly PlanChange[]): PlanOutcome {
  const placed = changes.filter((c) => c.toStart).length;
  return { placed, unplaced: changes.length - placed };
}

export const planMessage = (o: PlanOutcome) =>
  o.placed === 1
    ? "Placed 1 task in your day"
    : `Placed ${o.placed} tasks in your day`;

export const NOTHING_TO_PLAN =
  "Nothing to place. Tasks with Auto-schedule on get a time here.";

const STALE = "Your schedule changed while planning. Run Plan my day again.";

export function usePlanDay() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    void qc.invalidateQueries({ queryKey: qk.events() });
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }, [qc]);

  const plan = useCallback(async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    try {
      const preview = await sendJson<PreviewResponse>(
        "/api/tasks/reschedule-preview",
        "POST",
        { action: "preview" }
      );
      const outcome = planOutcome(preview.changes);
      if (!preview.changes.length) {
        notify.info(NOTHING_TO_PLAN);
        return;
      }
      const applied = await sendJson<ApplyResponse>(
        "/api/tasks/reschedule-preview",
        "POST",
        { action: "apply", token: preview.previewToken }
      );
      refresh();
      notify.success(planMessage(outcome), {
        action: {
          label: "Undo",
          onClick: () =>
            void sendJson("/api/tasks/reschedule-preview", "POST", {
              action: "undo",
              token: applied.undoToken,
            })
              .then(refresh)
              .catch((error: unknown) =>
                notify.error(
                  error instanceof ApiError && error.status === 409
                    ? "Could not undo: the schedule changed since."
                    : "Could not undo the plan."
                )
              ),
        },
      });
    } catch (error) {
      notify.error(
        error instanceof ApiError && error.status === 409
          ? STALE
          : error instanceof Error && error.message
            ? error.message
            : "Could not plan your day."
      );
    } finally {
      going.current = false;
      setBusy(false);
    }
  }, [refresh]);

  return { plan, busy };
}
