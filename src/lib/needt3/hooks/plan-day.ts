"use client";

import { useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { NEEDT_SCHEDULE_CHANGED_EVENT } from "@/lib/needt-events";
import { notify } from "@/lib/notifications";

import { ApiError, sendJson } from "./core";

/**
 * PLAN MY DAY. One server call (`POST /api/ai/plan-day`): the scheduler places
 * what has no time yet into the free slots, using the calendar, the per-day
 * working hours with their breaks, due dates, priority, estimates and
 * dependencies. The answer says where each task went and what did not fit,
 * and carries one action id; Undo puts every task back. It is a Pro action,
 * so a Free person never reaches it (PlanButton opens the plans) and the
 * server refuses anyway.
 */

export interface PlanItem {
  taskId: string;
  title: string;
  day: string;
  time: string;
  moved: boolean;
}

export interface PlanResponse {
  placed: number;
  moved: number;
  unplaced: Array<{ taskId: string; title: string }>;
  items: PlanItem[];
  headline: string;
  actionId: string | null;
  undoable: boolean;
}

/** The first few placements as one line: "Today 09:30–10:15 Taxes · …". */
export function planDetail(items: readonly PlanItem[], shown = 3): string {
  const lines = items
    .slice(0, shown)
    .map((item) => `${item.day} ${item.time} ${item.title}`);
  const rest = items.length - lines.length;
  return rest > 0 ? `${lines.join(" · ")} · +${rest} more` : lines.join(" · ");
}

export function usePlanDay() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    void qc.invalidateQueries({ queryKey: qk.events() });
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }, [qc]);

  const undo = useCallback(
    (actionId: string) =>
      sendJson(`/api/agent/actions/${actionId}/undo`, "POST")
        .then(refresh)
        .catch((error: unknown) =>
          notify.error(
            error instanceof ApiError && error.status === 409
              ? "Could not undo: the schedule changed since."
              : "Could not undo the plan."
          )
        ),
    [refresh]
  );

  const plan = useCallback(async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    try {
      const result = await sendJson<PlanResponse>(
        "/api/ai/plan-day",
        "POST",
        {}
      );
      refresh();
      if (!result.items.length) {
        notify.info(result.headline);
        return;
      }
      notify.success(result.headline, {
        description: planDetail(result.items),
        ...(result.undoable && result.actionId
          ? {
              action: {
                label: "Undo",
                onClick: () => void undo(result.actionId as string),
              },
            }
          : {}),
      });
    } catch (error) {
      notify.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not plan your day."
      );
    } finally {
      going.current = false;
      setBusy(false);
    }
  }, [refresh, undo]);

  return { plan, busy };
}
