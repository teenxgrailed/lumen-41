"use client";

import { useCallback } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { fetchJson, sendJson } from "./core";

/**
 * THE DAY'S HIGHLIGHT. The one task the person picked as the main thing of a
 * day, stored per day on the server (`/api/highlight`, readable by anyone with
 * API access). Home shows it big at the top; the row menu and "Make highlight"
 * set it. The day is the person's own ("YYYY-MM-DD").
 */

export interface Highlight {
  date: string;
  taskId: string;
}

interface Answer {
  highlight: Highlight | null;
}

export function useHighlight(day: string) {
  return useQuery({
    queryKey: qk.highlight(day),
    queryFn: async () =>
      (
        await fetchJson<Answer>(
          `/api/highlight?date=${encodeURIComponent(day)}`
        )
      ).highlight ?? null,
    staleTime: 60_000,
  });
}

/** Set or clear the day's highlight; the cache moves first and rolls back on failure. */
export function useSetHighlight(day: string) {
  const qc = useQueryClient();
  const key = qk.highlight(day);
  const mutation = useMutation({
    mutationFn: async (taskId: string | null) =>
      taskId
        ? (
            await sendJson<Answer>("/api/highlight", "PUT", {
              date: day,
              taskId,
            })
          ).highlight
        : (
            await fetchJson<Answer>(
              `/api/highlight?date=${encodeURIComponent(day)}`,
              { method: "DELETE" }
            )
          ).highlight,
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Highlight | null>(key);
      qc.setQueryData<Highlight | null>(
        key,
        taskId ? { date: day, taskId } : null
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(key, ctx?.before ?? null);
      notify.error("Could not change the highlight.");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const set = useCallback(
    (taskId: string | null) => mutation.mutateAsync(taskId).catch(() => null),
    [mutation]
  );
  return { set, pending: mutation.isPending };
}

/**
 * What a menu needs: whether a task is the day's highlight, and the one call
 * that makes it (or drops it). A new pick replaces the old one; one Undo
 * puts the previous pick back.
 */
export function useDayHighlight(day: string) {
  const query = useHighlight(day);
  const { set, pending } = useSetHighlight(day);
  const id = query.data?.taskId ?? null;
  const toggle = useCallback(
    async (taskId: string) => {
      const before = id;
      const next = before === taskId ? null : taskId;
      await set(next);
      notify.success(next ? "Made today’s highlight" : "Highlight removed", {
        action: { label: "Undo", onClick: () => void set(before) },
      });
    },
    [id, set]
  );
  return {
    id,
    isHighlight: (taskId: string) => id === taskId,
    toggle,
    pending,
  };
}
