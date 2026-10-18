/**
 * The day's highlight on Home, pure: which task it is and the line under it.
 */
import { dayLabel } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

import { dur } from "./derive";

/** The highlighted task, or null when none is set or it is gone or trashed. */
export function highlightTask(
  tasks: readonly V3Task[],
  id: string | null | undefined
): V3Task | null {
  if (!id) return null;
  const t = tasks.find((x) => x.id === id);
  return t && !t.trashedAt ? t : null;
}

/** "Due today · 45 min", "Overdue since 3 Sep", "Done". */
export function highlightMeta(t: V3Task, today: string): string {
  if (t.done) return "Done";
  const bits: string[] = [];
  if (t.dueDate) {
    if (t.dueDate < today) bits.push(`Overdue since ${dayLabel(t.dueDate)}`);
    else if (t.dueDate === today) bits.push("Due today");
    else bits.push(`Due ${dayLabel(t.dueDate)}`);
  }
  const d = dur(t.estimatedMinutes);
  if (d) bits.push(d);
  return bits.join(" · ");
}
