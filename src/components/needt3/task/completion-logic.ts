/**
 * The pure half of the shared completion (useCompletion): which rows another
 * writer (a second device, the MCP, the API) closed or reopened between two
 * reads of the task list. Kept free of React so it is unit-tested directly.
 */
import type { CompletionPhase } from "./useCompletion";

export interface DoneLike {
  id: string;
  done: boolean;
}

/** How long a struck row is held before it folds away. */
export const STRIKE_HOLD_MS = 600;
/** The fold itself; the row is gone when it ends. */
export const FOLD_MS = 300;

/**
 * Compare two reads of the list. `closed` are open-before, done-now tasks
 * nobody on this screen is already animating: they only fold (no pop, no
 * strike hold — the person did not tick them here). `reopened` are tasks that
 * were done and are open again while still playing an exit: the exit is
 * cancelled so the row does not fold away and come back.
 */
export function remoteChanges(
  prev: readonly DoneLike[] | undefined,
  next: readonly DoneLike[] | undefined,
  playing: Readonly<Record<string, CompletionPhase>>
): { closed: string[]; reopened: string[] } {
  const closed: string[] = [];
  const reopened: string[] = [];
  if (!prev || !next || prev === next) return { closed, reopened };
  const before = new Map(prev.map((t) => [t.id, t.done]));
  for (const t of next) {
    const was = before.get(t.id);
    if (was === undefined) continue;
    if (!was && t.done && !playing[t.id]) closed.push(t.id);
    if (was && !t.done && playing[t.id]) reopened.push(t.id);
  }
  return { closed, reopened };
}
