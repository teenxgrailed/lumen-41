/**
 * The flow inside a project: a task is the CLOSING step of its own small
 * chain. Its first step (`entry`) opens the chain, its subtasks (`parts`)
 * follow in order, and the task itself comes last and is done when everything
 * above it is. Pure: tasks in, the order and the labels out.
 *
 * What the data holds, and what it does not:
 *   - subtasks are `TaskPart` rows, one level deep, ordered by `position`;
 *   - `entry` is one line of text on the task, not a task;
 *   - a task waits on at most one other task (`blockedBy` ↔ `dependsOnId`);
 *   - there is no parent/child link between two tasks (no `parentId`).
 */
import { blockerOf } from "@/lib/needt3/derive";
import type { V3Task, V3TaskPart } from "@/lib/needt3/map";
import { tickClosesTask } from "@/lib/needt3/steps";

export { tickClosesTask };

export interface FlowSteps {
  /** The very first small step, when the task has one. */
  entry: string | null;
  /** Subtasks in the order they are done. */
  parts: readonly V3TaskPart[];
  total: number;
  done: number;
  open: number;
}

/**
 * The steps above a task, or null when it has no subtasks (then the row is
 * drawn alone, with its first step under it, as everywhere else).
 */
export function flowSteps(
  t: Pick<V3Task, "entry" | "parts" | "done">
): FlowSteps | null {
  const parts = t.parts ?? [];
  if (!parts.length) return null;
  const done = parts.filter((p) => p.done).length;
  return {
    entry: t.entry?.trim() || null,
    parts,
    total: parts.length,
    done,
    open: parts.length - done,
  };
}

/**
 * Blockers before the tasks they block, everything else in the order given.
 * A task whose blocker is not in the list (another project, or done) keeps its
 * place, and a loop (which the server refuses) cannot hang the page.
 */
export function flowOrder<T extends Pick<V3Task, "id" | "blockedBy">>(
  list: readonly T[]
): T[] {
  const byId = new Map(list.map((t) => [t.id, t] as const));
  const out: T[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const place = (t: T) => {
    if (placed.has(t.id) || visiting.has(t.id)) return;
    visiting.add(t.id);
    const blocker = t.blockedBy ? byId.get(t.blockedBy) : undefined;
    if (blocker) place(blocker);
    visiting.delete(t.id);
    if (placed.has(t.id)) return;
    placed.add(t.id);
    out.push(t);
  };
  for (const t of list) place(t);
  return out;
}

/** The open task `t` waits on, when it is still open and in `list`. */
export function waitsOn(t: V3Task, list: readonly V3Task[]) {
  const by = blockerOf(t, list);
  return by && by.kind === "task" ? by.task : null;
}

/** Ids of the open tasks that wait on another open task. */
export function blockedIds(list: readonly V3Task[]) {
  const ids = new Set<string>();
  for (const t of list) if (!t.done && waitsOn(t, list)) ids.add(t.id);
  return ids;
}

/** "Last step · 2 of 3 steps done" / "Last step · ready to close". */
export function closingLine(s: Pick<FlowSteps, "done" | "total" | "open">) {
  return s.open
    ? `Last step · ${s.done} of ${s.total} done`
    : "Last step · everything above is done";
}
