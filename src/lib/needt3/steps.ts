import type { V3Task } from "@/lib/needt3/map";

/**
 * Ticking `partId` closes the chain: it is the last open step of a task that
 * is still open. Reopening a step never closes anything. (A task is the final
 * step of its own subtasks: SCREENS.md, "the last part ticked closes the
 * parent".)
 */
export function tickClosesTask(
  t: Pick<V3Task, "done" | "parts">,
  partId: string
) {
  if (t.done) return false;
  const parts = t.parts ?? [];
  const part = parts.find((p) => p.id === partId);
  if (!part || part.done) return false;
  return parts.every((p) => p.id === partId || p.done);
}
