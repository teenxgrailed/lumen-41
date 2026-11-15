"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { qk } from "@/lib/needt3/query-keys";
import {
  ROW_FLIP_MS,
  flipRow,
  measureRow,
  prefersReducedMotion,
} from "@/lib/needt3/row-flip";
import { notify } from "@/lib/notifications";
import {
  type FirstReplanState,
  isLaterMove,
} from "@/lib/onboarding/first-replan";

import { useFirstReplanGate } from "@/store/first-replan";

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
 *
 * A proposed move is only offered when the task lands after the meeting and
 * after now (`isLaterMove`). After Keep the task row slides to its new slot;
 * the other hints on Today wait until the card is answered (`useFirstReplanGate`).
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

/**
 * True while the first-replan card is the only hint Today may show: the demo
 * is there, still overlapping, and the card has not been answered yet.
 */
export function useFirstReplanHold(): boolean {
  const demo = useFirstReplanDemo().data;
  const { settled, moving } = useFirstReplanGate();
  return (Boolean(demo?.conflict) || moving) && !settled;
}

/** Tells the server the card was drawn (once per account, counted there). */
export function useReportCardShown(shown: boolean) {
  const sent = useRef(false);
  useEffect(() => {
    if (!shown || sent.current) return;
    sent.current = true;
    sendJson(API, "POST").catch(() => undefined);
  }, [shown]);
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function useFirstReplan(demo: FirstReplanState | null | undefined) {
  const qc = useQueryClient();
  const [step, setStep] = useState<FirstReplanStep>({ kind: "idle" });
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.all() }),
    [qc]
  );
  const taskId = demo?.task.id;
  const settle = useFirstReplanGate((g) => g.settle);
  const setMoving = useFirstReplanGate((g) => g.setMoving);

  const replan = useCallback(async () => {
    setStep({ kind: "previewing" });
    try {
      const preview = await sendJson<PreviewReply>(PREVIEW_API, "POST", {
        action: "preview",
      });
      const move = preview.changes.find((c) => c.taskId === taskId);
      const to =
        move?.toStart && move.toEnd
          ? { start: move.toStart, end: move.toEnd }
          : null;
      // The demo promises a move after the meeting. Anything else (earlier
      // than now, or before the meeting) is not shown, and nothing is kept.
      if (to && demo && !isLaterMove(to, demo, newDate())) {
        logger.warn(
          "First replan proposed a move that is not later",
          { to: to.start },
          LOG_SOURCE
        );
        setStep({ kind: "idle" });
        notify.error("Could not plan that. Try again in a moment.");
        return;
      }
      setStep({ kind: "preview", token: preview.previewToken, to });
    } catch (error) {
      logger.warn(
        "First replan preview failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setStep({ kind: "idle" });
      notify.error("Could not plan that. Try again in a moment.");
    }
  }, [taskId, demo]);

  const keep = useCallback(
    async (token: string) => {
      setStep({ kind: "applying" });
      const before = taskId ? measureRow(taskId) : null;
      setMoving(true);
      try {
        const applied = await sendJson<ApplyReply>(PREVIEW_API, "POST", {
          action: "apply",
          token,
        });
        setStep({ kind: "kept", undoToken: applied.undoToken });
        await refresh();
        // Let the list re-render with the row in its new place, then slide it
        // there. The next hints wait for the slide, so the move is seen alone.
        await nextFrame();
        await nextFrame();
        const moving = taskId ? flipRow(taskId, before) : false;
        if (moving && !prefersReducedMotion()) {
          window.setTimeout(settle, ROW_FLIP_MS + 30);
        } else {
          settle();
        }
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        logger.warn(
          "First replan apply failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        setStep({ kind: "idle" });
        setMoving(false);
        if (stale) notify.warning("Your day changed. Press Replan again.");
        else notify.error("Could not keep that. Nothing was moved.");
      }
    },
    [refresh, taskId, settle, setMoving]
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

  /**
   * Removes the two demo tasks. "Skip" (`reason: "skip"`) is counted as the
   * first card being skipped; "Remove the demo" after Keep is not.
   */
  const remove = useCallback(
    async (reason?: "skip") => {
      try {
        await sendJson(reason ? `${API}?reason=${reason}` : API, "DELETE");
        qc.setQueryData(qk.firstReplan(), null);
        settle();
        setStep({ kind: "idle" });
        await refresh();
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : "Could not remove the demo."
        );
      }
    },
    [qc, refresh, settle]
  );

  return {
    step,
    replan,
    keep,
    undo,
    remove,
    notNow: () => {
      settle();
      setStep({ kind: "idle" });
    },
  };
}
