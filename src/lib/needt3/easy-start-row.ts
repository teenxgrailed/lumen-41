"use client";

/* ALWAYS EASY START, the task row. The row of a task that has an `entry` (its
   first easy step, 15 minutes or less) says the entry as its main text and the
   task title under it as "for: <title>". Three states:
   - normal: the entry and its "for:" line;
   - simplified: the same, plus Undo, for a few minutes after Easy start changed
     the task (the realtime `easy-start` event names the action to undo);
   - suggest: "Suggest" mode has a pending proposal for the task, so the row
     keeps its title and offers "Упростить?" (Apply runs the same task.simplify).
   A row with no entry and no proposal is drawn exactly as before. */
import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { fetchJson, sendJson } from "./hooks/core";
import { qk } from "./query-keys";

/** How long a row keeps its Undo after a simplification. */
export const SIMPLIFIED_WINDOW_MS = 5 * 60_000;

export type EasyStartRowState = "normal" | "simplified" | "suggest";

export interface RecentSimplify {
  actionId: string;
  at: number;
}

export interface EasyStartRowInput {
  entry?: string | null;
  done?: boolean;
  /** The pending proposal for this task ("suggest" mode), if any. */
  proposalId?: string | null;
  recent?: RecentSimplify | null;
  now: number;
}

/** Which of the three states a row is in, or null when it is drawn as before. */
export function easyStartRowState(
  i: EasyStartRowInput
): EasyStartRowState | null {
  if (i.done) return null;
  if (i.proposalId) return "suggest";
  if (!i.entry) return null;
  if (i.recent && i.now - i.recent.at < SIMPLIFIED_WINDOW_MS)
    return "simplified";
  return "normal";
}

interface RecentStore {
  byTask: Record<string, RecentSimplify>;
  record: (taskId: string, actionId: string, at: number) => void;
  forget: (taskId: string) => void;
}

/** The tasks Easy start changed in this session, and the action that undoes each. */
export const useRecentSimplified = create<RecentStore>((set) => ({
  byTask: {},
  record: (taskId, actionId, at) =>
    set((s) => ({ byTask: { ...s.byTask, [taskId]: { actionId, at } } })),
  forget: (taskId) =>
    set((s) => ({
      byTask: Object.fromEntries(
        Object.entries(s.byTask).filter(([id]) => id !== taskId)
      ),
    })),
}));

interface ProposalRow {
  id: string;
  taskId: string;
}

/** Pending proposals by task id (`GET /api/easy-start/proposals`). */
export function usePendingProposals(): Record<string, string> {
  const q = useQuery({
    queryKey: qk.easyStartProposals(),
    queryFn: async () =>
      (
        await fetchJson<{ proposals: ProposalRow[] }>(
          "/api/easy-start/proposals"
        )
      ).proposals,
    staleTime: 60_000,
  });
  const out: Record<string, string> = {};
  for (const p of q.data ?? []) out[p.taskId] ??= p.id;
  return out;
}

export interface EasyStartRowApi {
  state: EasyStartRowState;
  undo: () => Promise<void>;
  apply: () => Promise<void>;
}

/** The row's state and actions for one task, or null when it is drawn as before. */
export function useEasyStartRow(task: {
  id: string;
  entry?: string | null;
  done?: boolean;
}): EasyStartRowApi | null {
  const proposals = usePendingProposals();
  const recent = useRecentSimplified((s) => s.byTask[task.id]);
  const record = useRecentSimplified((s) => s.record);
  const forget = useRecentSimplified((s) => s.forget);
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recent) return;
    const left = SIMPLIFIED_WINDOW_MS - (Date.now() - recent.at);
    const t = setTimeout(() => setNow(Date.now()), Math.max(left, 0) + 50);
    return () => clearTimeout(t);
  }, [recent]);
  const proposalId = proposals[task.id] ?? null;
  const state = easyStartRowState({
    entry: task.entry,
    done: task.done,
    proposalId,
    recent,
    now: Math.max(now, recent?.at ?? 0),
  });
  if (!state) return null;
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.tasks() }),
      qc.invalidateQueries({ queryKey: qk.easyStartProposals() }),
    ]);
  };
  return {
    state,
    undo: async () => {
      if (!recent) return;
      await sendJson(`/api/agent/actions/${recent.actionId}/undo`, "POST");
      forget(task.id);
      await refresh();
    },
    apply: async () => {
      if (!proposalId) return;
      const res = await sendJson<{ actionId?: string }>(
        `/api/easy-start/proposals/${proposalId}`,
        "POST",
        { action: "apply" }
      );
      if (res?.actionId) record(task.id, res.actionId, Date.now());
      await refresh();
    },
  };
}
