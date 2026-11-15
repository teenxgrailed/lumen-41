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

import { type HintStage, useFirstReplanGate } from "@/store/first-replan";

import { ApiError, fetchJson, sendJson } from "./core";

const LOG_SOURCE = "v3-first-replan";
const API = "/api/onboarding/first-replan";
const DEMO_PREVIEW_API = "/api/onboarding/first-replan/preview";
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
  previewToken: string | null;
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

/** Which hint Today may show right now; see `HintStage` in the store. */
export type CurrentHint = "card" | "replanned" | "sample" | "review";

/**
 * The one hint a new account's Today shows at a time. `current` is null when
 * there is no demo sequence (flag off, old account, sequence finished): then
 * nothing is held and every block shows as it always did. Otherwise only the
 * block named by `current` shows, in this order: the replan card, the
 * "Replanned" card, "This is a sample day", the Sunday review.
 */
export function useFirstReplanHints() {
  const demo = useFirstReplanDemo().data;
  const taskId = useFirstReplanGate((g) => g.taskId);
  const stage = useFirstReplanGate((g) => g.stage);
  const moving = useFirstReplanGate((g) => g.moving);
  const begin = useFirstReplanGate((g) => g.begin);
  const goTo = useFirstReplanGate((g) => g.goTo);
  const demoId = demo?.task.id;
  const fresh = Boolean(demoId) && taskId !== demoId;
  useEffect(() => {
    if (demoId && taskId !== demoId) begin(demoId);
  }, [demoId, taskId, begin]);
  const at: HintStage = fresh ? "card" : stage;

  let current: CurrentHint | null = null;
  if (moving) current = "card";
  else if (at === "card") {
    current = demo ? (demo.conflict ? "card" : "replanned") : null;
  } else if (at === "replanned") current = demo ? "replanned" : "sample";
  else if (at === "sample") current = "sample";
  else if (at === "review") current = "review";
  return { current, goTo };
}

/**
 * The Sunday review is the last held hint. Once it is not on screen (closed,
 * or there is none today) the sequence is over and the rest of Today shows.
 */
export function useAdvanceReview(reviewShown: boolean, ready: boolean) {
  const { current, goTo } = useFirstReplanHints();
  useEffect(() => {
    if (ready && current === "review" && !reviewShown) goTo("done");
  }, [ready, current, reviewShown, goTo]);
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
  const goTo = useFirstReplanGate((g) => g.goTo);
  const setMoving = useFirstReplanGate((g) => g.setMoving);

  const replan = useCallback(async () => {
    setStep({ kind: "previewing" });
    try {
      // The server picks the first free gap after the meeting, one that
      // touches no other task or event; Keep applies it for real below.
      const preview = await sendJson<PreviewReply>(DEMO_PREVIEW_API, "POST");
      if (!preview.previewToken) {
        setStep({ kind: "idle" });
        notify.error("Could not find a free slot today. Try again later.");
        return;
      }
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
          window.setTimeout(() => goTo("replanned"), ROW_FLIP_MS + 30);
        } else {
          goTo("replanned");
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
    [refresh, taskId, goTo, setMoving]
  );

  const undo = useCallback(
    async (token: string) => {
      try {
        await sendJson(PREVIEW_API, "POST", { action: "undo", token });
        // The demo overlaps again: back to the card, nothing else showing.
        goTo("card");
        setStep({ kind: "idle" });
        await refresh();
      } catch (error) {
        const stale = error instanceof ApiError && error.status === 409;
        notify.warning(stale ? "Cannot undo that now" : "Could not undo");
      }
    },
    [refresh, goTo]
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
        goTo("sample");
        setStep({ kind: "idle" });
        await refresh();
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : "Could not remove the demo."
        );
      }
    },
    [qc, refresh, goTo]
  );

  return {
    step,
    replan,
    keep,
    undo,
    remove,
    /** Closes the card; the next hint is "This is a sample day". */
    close: () => goTo("sample"),
    notNow: () => {
      goTo("sample");
      setStep({ kind: "idle" });
    },
  };
}
