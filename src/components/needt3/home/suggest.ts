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
