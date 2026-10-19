"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { newDate } from "@/lib/date-utils";
import { qk } from "@/lib/needt3/query-keys";
import {
  STARTER_HIDE_DAYS,
  STARTER_OPEN_TASK_LIMIT,
  type StarterGameStatus,
  type StarterHide,
} from "@/lib/starter-game";

import { fetchJson, sendJson } from "./core";

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
