"use client";

import { useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { ApiError, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { NEEDT_SCHEDULE_CHANGED_EVENT } from "@/lib/needt-events";
import { notify } from "@/lib/notifications";

import { type SpreadResult, spreadSummary } from "./spread";

interface SpreadAnswer {
  result: SpreadResult;
  actionId: string | null;
  undoable: boolean;
}

/** How the face says it: the desktop's notice by default, the phone's snack. */
export type SpreadSay = (
  headline: string,
  detail?: string,
  undo?: () => Promise<unknown>
) => void;

const sayNotice: SpreadSay = (headline, detail, undo) =>
  notify.success(headline, {
    ...(detail ? { description: detail } : {}),
    ...(undo ? { action: { label: "Undo", onClick: () => void undo() } } : {}),
  });

/**
 * SPREAD: one server call (`POST /api/tasks/spread`, the `task.spread` op)
 * gives each task the first day from today with room for it. The answer says
 * where they went; one Undo puts every task back.
 */
export function useSpread(say: SpreadSay = sayNotice) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    // a placed task's pushed block moves with it
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
              ? "Could not undo: those tasks changed since."
              : "Could not undo the spread."
          )
        ),
    [refresh]
  );

  const spread = useCallback(
    async (taskIds: readonly string[]) => {
      if (going.current || !taskIds.length) return;
      going.current = true;
      setBusy(true);
      try {
        const answer = await sendJson<SpreadAnswer>(
          "/api/tasks/spread",
          "POST",
          { taskIds: taskIds.slice(0, 100) }
        );
        refresh();
        const { headline, detail } = spreadSummary(answer.result);
        const id = answer.undoable ? answer.actionId : null;
        say(headline, detail, id ? () => undo(id) : undefined);
      } catch (error) {
        notify.error(
          error instanceof Error && error.message
            ? error.message
            : "Could not spread these tasks."
        );
      } finally {
        going.current = false;
        setBusy(false);
      }
    },
    [refresh, say, undo]
  );

  return { spread, busy };
}
