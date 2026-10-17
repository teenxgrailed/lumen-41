/**
 * The steps of a task as a row draws them: numbered by position, the first
 * two-minute step (`entry`) as Step 1 when the task has subtasks, then the
 * subtasks in order. Pure: a task in, the list out.
 *
 * `entry` is one line of text, not a row, so it has no tick of its own: it
 * counts as done once the task is closed or any subtask is ticked.
 */
import type { V3Task, V3TaskPart } from "./map";

export interface StepItem {
  /** "entry" or the part's id. */
  key: string;
  /** 1-based position among all steps. */
  n: number;
  title: string;
  done: boolean;
  /** The subtask behind it; null for the entry, which cannot be ticked. */
  part: V3TaskPart | null;
}

type Stepped = Pick<V3Task, "done"> & Partial<Pick<V3Task, "entry" | "parts">>;

export function stepList(t: Stepped): StepItem[] {
  const parts = t.parts ?? [];
  if (!parts.length) return [];
  const entry = t.entry?.trim();
  const items: Omit<StepItem, "n">[] = [];
  if (entry)
    items.push({
      key: "entry",
      title: entry,
      done: t.done || parts.some((p) => p.done),
      part: null,
    });
  for (const p of parts)
    items.push({ key: p.id, title: p.title, done: p.done, part: p });
  return items.map((s, i) => ({ ...s, n: i + 1 }));
}

/** The first step still to do, or null when nothing is left (or the task is closed). */
export function nextStep(items: readonly StepItem[], taskDone: boolean) {
  return taskDone ? null : (items.find((s) => !s.done) ?? null);
}

export const stepLabel = (s: Pick<StepItem, "n" | "title">) =>
  `Step ${s.n}: ${s.title}`;
