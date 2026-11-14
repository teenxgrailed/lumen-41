"use client";

import { useCallback, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";
import type { FirstReplanState } from "@/lib/onboarding/first-replan";

import { ApiError, fetchJson, sendJson } from "./core";

const LOG_SOURCE = "v3-first-replan";
const API = "/api/onboarding/first-replan";
const PREVIEW_API = "/api/tasks/reschedule-preview";

/**
 * The first replan on Today (`first_replan_onboarding`): the demo meeting that
 * sits on a demo task, and the three steps the person takes on it. It talks to
 * the same preview -> apply -> undo as the AI chat, so Keep is the real apply.
 *
 *   idle -> previewing -> preview -> applying -> kept   (Not now: back to idle)
 */

export type FirstReplanStep =
  | { kind: "idle" }
  | { kind: "previewing" }
  | {
      kind: "preview";
      token: string;
      /** Where the demo task goes, null when the scheduler left it put. */
      to: { start: string; end: string } | null;
    }
  | { kind: "applying" }
  | { kind: "kept"; undoToken: string };

interface PreviewReply {
  previewToken: string;
  changes: { taskId: string; toStart: string | null; toEnd: string | null }[];
}
interface ApplyReply {
  undoToken: string;
}

export function useFirstReplanDemo() {
  return useQuery({
    queryKey: qk.firstReplan(),
    queryFn: async () =>
      (await fetchJson<{ demo: FirstReplanState | null }>(API)).demo,
    staleTime: 60_000,
    // A failed read just means no card; never an error on Today.
    retry: false,
  });
}

export function useFirstReplan(demo: FirstReplanState | null | undefined) {
  const qc = useQueryClient();
  const [step, setStep] = useState<FirstReplanStep>({ kind: "idle" });
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.all() }),
    [qc]
  );
  const taskId = demo?.task.id;

  const replan = useCallback(async () => {
    setStep({ kind: "previewing" });
    try {
      const preview = await sendJson<PreviewReply>(PREVIEW_API, "POST", {
        action: "preview",
      });
      const move = preview.changes.find((c) => c.taskId === taskId);
      setStep({
        kind: "preview",
        token: preview.previewToken,
        to:
          move?.toStart && move.toEnd
            ? { start: move.toStart, end: move.toEnd }
            : null,
      });
    } catch (error) {
      logger.warn(
        "First replan preview failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setStep({ kind: "idle" });
      notify.error("Could not plan that. Try again in a moment.");
    }
  }, [taskId]);

  const keep = useCallback(
    async (token: string) => {
      setStep({ kind: "applying" });
      try {
        const applied = await sendJson<ApplyReply>(PREVIEW_API, "POST", {
          action: "apply",
          token,
        });
        setStep({ kind: "kept", undoToken: applied.undoToken });
        await refresh();
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        logger.warn(
          "First replan apply failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        setStep({ kind: "idle" });
        if (stale) notify.warning("Your day changed. Press Replan again.");
        else notify.error("Could not keep that. Nothing was moved.");
      }
    },
    [refresh]
  );

  const undo = useCallback(
    async (token: string) => {
      try {
        await sendJson(PREVIEW_API, "POST", { action: "undo", token });
        setStep({ kind: "idle" });
        await refresh();
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        notify.warning(stale ? "Cannot undo that now" : "Could not undo");
      }
    },
    [refresh]
  );

  /** Removes the two demo tasks: "Skip" and "Remove the demo" are this. */
  const remove = useCallback(async () => {
    try {
      await sendJson(API, "DELETE");
      qc.setQueryData(qk.firstReplan(), null);
      setStep({ kind: "idle" });
      await refresh();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not remove the demo."
      );
    }
  }, [qc, refresh]);

  return {
    step,
    replan,
    keep,
    undo,
    remove,
    notNow: () => setStep({ kind: "idle" }),
  };
}
