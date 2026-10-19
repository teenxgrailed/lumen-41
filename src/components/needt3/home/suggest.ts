/**
 * The highlight suggestion, pure: which task to offer as today's highlight.
 */
import type { V3Priority, V3Task } from "@/lib/needt3/map";

import { dur } from "./derive";

const RANK: Record<V3Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/**
 * Open tasks due today, most important first: priority, then the earlier
 * scheduled hour, then the longer job (the one to protect time for), then title.
 */
export function highlightCandidates(
  tasks: readonly V3Task[],
  today: string
): V3Task[] {
  return tasks
    .filter((t) => !t.done && !t.trashedAt && !t.noSlot && t.dueDate === today)
    .sort(
      (a, b) =>
        RANK[a.priority] - RANK[b.priority] ||
        (a.scheduledStart ?? "9999").localeCompare(
          b.scheduledStart ?? "9999"
        ) ||
        (b.estimatedMinutes ?? 0) - (a.estimatedMinutes ?? 0) ||
        a.title.localeCompare(b.title)
    );
}

/** The `n`th suggestion, wrapping round, or null when nothing is due today. */
export function suggestHighlight(
  tasks: readonly V3Task[],
  today: string,
  n: number
): { task: V3Task; of: number } | null {
  const list = highlightCandidates(tasks, today);
  if (!list.length) return null;
  return {
    task: list[((n % list.length) + list.length) % list.length] as V3Task,
    of: list.length,
  };
}

/** "High priority · 45 min", the words under the suggestion. */
export function suggestMeta(t: V3Task): string {
  const bits: string[] = [];
  if (t.priority === "urgent" || t.priority === "high")
    bits.push(t.priority === "urgent" ? "Urgent" : "High priority");
  const d = dur(t.estimatedMinutes);
  if (d) bits.push(d);
  return bits.join(" · ");
}

/** How many suggestions "Another" cycles through, and how many tasks the model reads. */
export const SUGGESTIONS_MAX = 3;
export const AI_POOL_MAX = 12;

export interface PoolEntry {
  task: V3Task;
  /** One of the week's focuses (Sunday review). */
  focus: boolean;
}

export interface Suggestion extends PoolEntry {
  /** One line on why this task, from the model or from the rules below. */
  reason: string;
}

/**
 * Who can be suggested: the tasks the week's focuses point at first (in the
 * focuses' order), then the open tasks due today, most important first. Each
 * task once, at most `AI_POOL_MAX`.
 */
export function suggestionPool(
  tasks: readonly V3Task[],
  today: string,
  focus: readonly V3Task[] = []
): PoolEntry[] {
  const out: PoolEntry[] = focus.map((task) => ({ task, focus: true }));
  for (const task of highlightCandidates(tasks, today)) {
    if (!out.some((e) => e.task.id === task.id))
      out.push({ task, focus: false });
  }
  return out.slice(0, AI_POOL_MAX);
}

/** The rules' one-line reason, for a person without the agent. */
export function reasonFor(e: PoolEntry, today: string): string {
  const t = e.task;
  if (e.focus) return "One of your focuses for this week.";
  const due = t.dueDate === today ? ", due today" : "";
  if (t.priority === "urgent") return `Marked urgent${due}.`;
  if (t.priority === "high") return `High priority${due}.`;
  const at = t.scheduledStart?.slice(11, 16);
  if (at) return `Planned for ${at} today.`;
  const d = dur(t.estimatedMinutes);
  return d ? `Due today, and it needs ${d}.` : "Due today.";
}

/** The first three of the pool with the rules' reasons: the answer without the agent. */
export function ruleSuggestions(
  pool: readonly PoolEntry[],
  today: string
): Suggestion[] {
  return pool
    .slice(0, SUGGESTIONS_MAX)
    .map((e) => ({ ...e, reason: reasonFor(e, today) }));
}

/**
 * The agent's picks in its order, each with its reason; ids that are not in
 * the pool any more (done, moved) are dropped. Nothing left means the rules'
 * answer, so a suggestion never disappears because the agent was wrong.
 */
export function agentSuggestions(
  pool: readonly PoolEntry[],
  picks: readonly { taskId: string; reason: string }[] | null | undefined,
  today: string
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const p of picks ?? []) {
    const e = pool.find((x) => x.task.id === p.taskId);
    if (e && p.reason.trim() && !out.some((s) => s.task.id === e.task.id))
      out.push({ ...e, reason: p.reason.trim() });
    if (out.length === SUGGESTIONS_MAX) break;
  }
  return out.length ? out : ruleSuggestions(pool, today);
}

/** The model's view of the pool (`POST /api/ai/highlight-suggestions`). */
export function aiCandidates(pool: readonly PoolEntry[]) {
  return pool.map(({ task: t, focus }) => ({
    id: t.id,
    title: t.title.slice(0, 120),
    due: t.dueDate,
    priority: t.priority,
    minutes: t.estimatedMinutes ?? null,
    focus,
  }));
}
