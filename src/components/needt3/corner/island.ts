/* THE ISLAND'S ARITHMETIC — kept out of the component so it can be checked.
 *
 * Notices raised through `notify` (src/lib/notifications.ts) arrive here. The
 * pill grows into the island to carry them; it is the same element, never a
 * second object beside it. At most ISLAND_ROWS rows are drawn, newest at the
 * bottom nearest the pill. A count appears only when rows are hidden: a tally
 * of rows you can already see is noise.
 */
import { STACK_SHOWN } from "@/components/needt/corner/stack";
import type { Notice } from "@/components/needt/corner/types";

/** Rows drawn at once. Shares the stack's limit of four. */
export const ISLAND_ROWS = STACK_SHOWN;

export interface IslandView {
  /** Drawn rows, oldest first (the newest is last, nearest the pill). */
  readonly rows: readonly Notice[];
  /** Notices kept but not drawn, not counting ones already leaving. */
  readonly hidden: number;
}

export function islandView(
  list: readonly Notice[],
  cap: number = ISLAND_ROWS
): IslandView {
  const max = Math.max(1, Math.floor(cap));
  const rows = list.slice(-max);
  const rest = list.slice(0, Math.max(0, list.length - max));
  return { rows, hidden: rest.filter((n) => !n.leaving).length };
}

/** The count line, or null when nothing is hidden. */
export function hiddenLabel(hidden: number): string | null {
  if (hidden <= 0) return null;
  return `${hidden} more`;
}

/** True while there is anything for the island to say. */
export function islandHasRows(list: readonly Notice[]): boolean {
  return list.some((n) => !n.leaving);
}

/** The act a row offers as its button: the first one, if any. */
export function primaryAct(notice: Notice) {
  return notice.acts && notice.acts.length ? notice.acts[0] : null;
}
