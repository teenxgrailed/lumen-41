"use client";

import { useCallback, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, sendJson } from "./core";

const LOG_SOURCE = "v3-missed-keep";
const API = "/api/tasks/reschedule-preview";
/** The scoped replan takes at most this many ids. */
const MAX_IDS = 100;

/**
 * Keep for "N tasks from earlier today": the scoped replan of the reschedule
 * preview. Only the missed tasks named are moved, into free windows from now
 * on, inside working hours; nothing else is touched.
 *
 *   idle -> previewing -> preview -> applying -> idle   (Dismiss: back to idle)
 *
 * Keep leaves a notice with Undo. Any failure (429 included) says so and
 * moves nothing.
 */

export interface MissedChange {
  taskId: string;
  title: string;
  toStart: string | null;
  toEnd: string | null;
  explanation: string;
}
export interface MissedUnscheduled {
  taskId: string;
  title: string;
}

export type MissedKeepStep =
  | { kind: "idle" }
  | { kind: "previewing" }
  | {
      kind: "preview";
      token: string;
      changes: MissedChange[];
      unscheduled: MissedUnscheduled[];
    }
  | {
      kind: "applying";
      changes: MissedChange[];
      unscheduled: MissedUnscheduled[];
    };

interface PreviewReply {
  previewToken: string;
  changes: MissedChange[];
  unscheduled: MissedUnscheduled[];
}
interface ApplyReply {
  undoToken: string;
}

export function useMissedKeep() {
  const qc = useQueryClient();
  const [step, setStep] = useState<MissedKeepStep>({ kind: "idle" });
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.all() }),
    [qc]
  );

  const undo = useCallback(
    async (token: string) => {
      try {
        await sendJson(API, "POST", { action: "undo", token });
        void refresh();
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

  /** Ask where the missed tasks would go. Shows nothing until it answers. */
  const preview = useCallback(async (taskIds: string[]) => {
    if (!taskIds.length) return;
    setStep({ kind: "previewing" });
    try {
      const reply = await sendJson<PreviewReply>(API, "POST", {
        action: "preview",
        taskIds: taskIds.slice(0, MAX_IDS),
      });
      const changes = reply.changes ?? [];
      const unscheduled = reply.unscheduled ?? [];
      if (!changes.length && !unscheduled.length) {
        setStep({ kind: "idle" });
        notify.info("Nothing to move", {
          description: "Those tasks cannot be moved.",
        });
        return;
      }
      setStep({
        kind: "preview",
        token: reply.previewToken,
        changes,
        unscheduled,
      });
    } catch (error) {
      logger.warn(
        "Missed tasks preview failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setStep({ kind: "idle" });
      notify.error("Could not plan those tasks. Nothing was moved.");
    }
  }, []);

  const keep = useCallback(async () => {
    if (step.kind !== "preview") return;
    const { token, changes, unscheduled } = step;
    setStep({ kind: "applying", changes, unscheduled });
    try {
      const applied = await sendJson<ApplyReply>(API, "POST", {
        action: "apply",
        token,
      });
      setStep({ kind: "idle" });
      void refresh();
      const n = changes.length;
      notify.success(`Moved ${n} ${n === 1 ? "task" : "tasks"}`, {
        description: "Into your open slots.",
        duration: 30_000,
        action: { label: "Undo", onClick: () => void undo(applied.undoToken) },
      });
    } catch (error) {
      const stale = error instanceof ApiError && error.status === 409;
      logger.warn(
        "Missed tasks apply failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setStep({ kind: "idle" });
      if (stale) {
        notify.warning("Your day changed", {
          description: "Press open slots again.",
        });
      } else {
        notify.error("Could not move those tasks. Nothing was moved.");
      }
    }
  }, [step, refresh, undo]);

  const dismiss = useCallback(() => setStep({ kind: "idle" }), []);

  return { step, preview, keep, dismiss };
}
