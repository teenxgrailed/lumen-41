"use client";

import { useCallback } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { qk } from "@/lib/needt3/query-keys";
import { NEEDT_SCHEDULE_CHANGED_EVENT } from "@/lib/needt-events";
import {
  STARTER_HIDE_DAYS,
  STARTER_OPEN_TASK_LIMIT,
  type StarterAnswers,
  type StarterCreateInput,
  type StarterCreateResult,
  type StarterGameStatus,
  type StarterHide,
  type StarterPlanResult,
} from "@/lib/starter-game";

import { fetchJson, sendJson } from "./core";
import type { PlanResponse } from "./plan-day";

/**
 * THE STARTER GAME's entry card (`/api/starter-game`). The server says whether
 * the card may show (fewer than five open tasks, not hidden) and whether the
 * plan can play it; this only reads that and writes "Not now" / "Don't show
 * again". Nothing here shows an error: a card that cannot load is not drawn.
 */
export function useStarterGameStatus() {
  return useQuery({
    queryKey: qk.starterGame(),
    queryFn: () => fetchJson<StarterGameStatus>("/api/starter-game"),
    staleTime: 60_000,
    retry: false,
  });
}

/** "7d" is Not now, "never" is Don't show again. The card leaves at once. */
export function useHideStarterGame() {
  const qc = useQueryClient();
  const key = qk.starterGame();
  return useMutation({
    mutationFn: (hide: StarterHide) =>
      sendJson<StarterGameStatus>("/api/starter-game", "PATCH", { hide }),
    onMutate: (hide) => {
      const before = qc.getQueryData<StarterGameStatus>(key);
      if (before) {
        qc.setQueryData<StarterGameStatus>(key, {
          ...before,
          neverShow: hide === "never",
          hiddenUntil:
            hide === "7d"
              ? new Date(
                  newDate().getTime() + STARTER_HIDE_DAYS * 86_400_000
                ).toISOString()
              : null,
          hidden: hide !== "show",
          eligible:
            hide === "show" && before.openTasks < STARTER_OPEN_TASK_LIMIT,
        });
      }
      return { before };
    },
    onError: (_error, _hide, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
    },
    onSuccess: (status) => qc.setQueryData(key, status),
  });
}

/**
 * THE ONE AGENT REQUEST (`POST /api/starter-game/plan`), made after the third
 * answer: 12 to 16 tiles and one extra suggestion per lane, in one answer. The
 * game keeps both; nothing after this asks the model again.
 */
export function useStarterPlan() {
  return useMutation({
    mutationFn: (answers: StarterAnswers) =>
      sendJson<StarterPlanResult>("/api/starter-game/plan", "POST", answers),
  });
}

export interface StarterCreated {
  result: StarterCreateResult;
  actionId: string | null;
  undoable: boolean;
}

/** The lists a create or an undo changes. */
function useRefreshLists() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of [
      qk.tasks(),
      qk.projects(),
      qk.habits(),
      qk.events(),
      qk.starterGame(),
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
    window.dispatchEvent(new CustomEvent(NEEDT_SCHEDULE_CHANGED_EVENT));
  }, [qc]);
}

/**
 * Creates what was sorted (`POST /api/starter-game/create`): one transaction,
 * one AgentAction. The lists the screens read are refreshed; the card leaves
 * on its own once the tasks make five.
 */
export function useStarterCreate() {
  const refresh = useRefreshLists();
  return useMutation({
    mutationFn: (input: StarterCreateInput) =>
      sendJson<StarterCreated>("/api/starter-game/create", "POST", input),
    onSuccess: refresh,
  });
}

/** Undo one applied action (`POST /api/agent/actions/:id/undo`) and refresh what it touched. */
export function useUndoStarterAction() {
  const refresh = useRefreshLists();
  return useCallback(
    async (actionId: string) => {
      await sendJson(`/api/agent/actions/${actionId}/undo`, "POST");
      refresh();
    },
    [refresh]
  );
}

/**
 * "Plan my day" for the summary (`POST /api/ai/plan-day`, the existing route):
 * the scheduler places what has no time yet around the events, as one action
 * the summary can undo. Unlike the Home button it reports into the game, not
 * as a toast.
 */
export function useStarterPlanDay() {
  const refresh = useRefreshLists();
  return useMutation({
    mutationFn: () => sendJson<PlanResponse>("/api/ai/plan-day", "POST", {}),
    onSuccess: refresh,
  });
}
