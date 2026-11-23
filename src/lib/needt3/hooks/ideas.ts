"use client";

import { useCallback, useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type IdeaCardData,
  type IdeaCardSurface,
  type IdeaCardsResponse,
  type IdeaTakeResult,
} from "@/lib/needt3/idea-cards";
import { qk } from "@/lib/needt3/query-keys";

import { fetchJson, sendJson } from "./core";

export type { IdeaCardData, IdeaCardSurface, IdeaTakeResult };

/** Every write answers with the logged action; Undo runs its inverse. */
interface Written<T> {
  result: T;
  actionId: string | null;
}

/**
 * THE IDEA CARDS (data only). Today's cards from the server, which owns the
 * rules: at most 2 a day, least recently shown first, the same on every device,
 * none when the person turned them off or the screen is the evening review or
 * the day plan. The screen draws `cards` between its tasks (each carries an
 * `after` hint) and calls `take` or `skip`.
 *
 *   const { cards, loading, take, skip } = useIdeaCards({ day: today });
 *
 * `take(id)` makes the idea a task and the scheduler places it now; it answers
 * with where it went and an `undo()` that turns it back into an idea. `skip(id)`
 * hides the idea for 7 days (the 3rd skip archives it). Both remove the card at
 * once and refresh the task lists.
 *
 * Reading the cards writes nothing on the server. Call `markShown(card)` when a
 * card is actually drawn on screen (an effect on mount, or when it scrolls into
 * view): that is what counts it against the day's two and records `idea_shown`.
 * It is safe to call on every render of the same card: each id is sent once per
 * page load, and a card with `shown: true` is not sent at all. A refusal (the
 * day's two are used, the idea was snoozed meanwhile) is swallowed; the next read
 * simply no longer returns the card.
 */
export function useIdeaCards(
  options: {
    /** The person's local day, "YYYY-MM-DD"; another day than the server's returns none. */
    day?: string;
    surface?: IdeaCardSurface;
    /** How many tasks the list shows (the server counts the day's when omitted). */
    visibleTasks?: number;
    enabled?: boolean;
  } = {}
) {
  const qc = useQueryClient();
  const { day, surface, visibleTasks, enabled = true } = options;
  const key = qk.ideaCards(day);

  const cardsQuery = useQuery({
    queryKey: [...key, surface ?? "", visibleTasks ?? ""],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (day) q.set("day", day);
      if (surface) q.set("surface", surface);
      if (visibleTasks !== undefined) {
        q.set("visibleTasks", String(visibleTasks));
      }
      const query = q.toString();
      const { result } = await fetchJson<{ result: IdeaCardsResponse }>(
        `/api/ideas/cards${query ? `?${query}` : ""}`
      );
      return result;
    },
    enabled,
    // The server stamps a card shown on every read, so a refetch on every focus
    // would be a read for nothing: the day's cards do not change.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const drop = useCallback(
    (id: string) => {
      qc.setQueriesData<IdeaCardsResponse>({ queryKey: key }, (data) =>
        data
          ? { ...data, cards: data.cards.filter((card) => card.id !== id) }
          : data
      );
    },
    [qc, key]
  );

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.tasks() });
    void qc.invalidateQueries({ queryKey: qk.ideas() });
  }, [qc]);

  const undo = useCallback(
    async (actionId: string) => {
      await sendJson(`/api/agent/actions/${actionId}/undo`, "POST");
      void qc.invalidateQueries({ queryKey: qk.ideaCards() });
      refresh();
    },
    [qc, refresh]
  );

  const sent = useRef(new Set<string>());
  const markShown = useCallback(
    async (card: Pick<IdeaCardData, "id" | "after" | "shown">) => {
      if (card.shown || sent.current.has(card.id)) return;
      sent.current.add(card.id);
      try {
        await sendJson(`/api/ideas/${card.id}/shown`, "POST", {
          position: card.after,
        });
        qc.setQueriesData<IdeaCardsResponse>({ queryKey: key }, (data) =>
          data
            ? {
                ...data,
                cards: data.cards.map((c) =>
                  c.id === card.id ? { ...c, shown: true } : c
                ),
              }
            : data
        );
      } catch {
        // Refused (the day's two are used, snoozed meanwhile) or offline: the
        // card is not counted and not retried this page load; a later read
        // decides what is shown.
      }
    },
    [qc, key]
  );

  const takeMutation = useMutation({
    mutationFn: (id: string) =>
      sendJson<Written<IdeaTakeResult>>(`/api/ideas/${id}/take`, "POST"),
    onSuccess: (_data, id) => {
      drop(id);
      refresh();
    },
  });

  const skipMutation = useMutation({
    mutationFn: (id: string) =>
      sendJson<Written<{ snoozedUntil: string; archived: boolean }>>(
        `/api/ideas/${id}/skip`,
        "POST"
      ),
    onSuccess: (_data, id) => {
      drop(id);
      refresh();
    },
  });

  return {
    cards: (cardsQuery.data?.cards ?? []) as IdeaCardData[],
    /** Why there are none, when there are none. */
    none: cardsQuery.data?.none,
    loading: cardsQuery.isLoading,
    /** The screen drew this card: counts it against the day's two, once. */
    markShown,
    /** Take: the idea becomes a task, placed now. Resolves with the result and its `actionId`. */
    take: (id: string) => takeMutation.mutateAsync(id),
    /** Skip: hidden for 7 days. Resolves with its `actionId`. */
    skip: (id: string) => skipMutation.mutateAsync(id),
    /** Undo a take or skip by the `actionId` it returned. */
    undo,
    taking: takeMutation.isPending,
    skipping: skipMutation.isPending,
  };
}
