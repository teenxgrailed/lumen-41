/**
 * When rows of a live table move, as plain functions (tested without React).
 *
 * PORT.md §6: the thing that changed moves and nothing else does; 0.42s rise
 * and settle; 55ms between things that arrive together. The header leads, so
 * a table being built reads header first, then rows in order.
 */

/** Gap between rows that arrive in the same read. */
export const ARRIVAL_STAGGER_MS = 55;
/** Head start of the header over the first row of a fresh table. */
export const HEADER_LEAD_MS = 120;
/** A table touched this recently is still being written: poll and animate. */
export const BUILDING_WINDOW_MS = 2 * 60 * 1000;

export function isBuilding(
  table: { updatedAt: string; createdAt: string },
  now: Date
): boolean {
  const touched = Date.parse(table.updatedAt || table.createdAt);
  return Number.isFinite(touched) && now.getTime() - touched < BUILDING_WINDOW_MS;
}

/**
 * Entry delay for each row that is new to the screen.
 *
 * - `known` null: first read. Rows animate only when the table is still being
 *   built (`animateFirst`), behind the header; an old table shows at once.
 * - Otherwise rows not in `known` arrived since the last read and step in
 *   order, 55ms apart; rows already shown get no delay (they do not move).
 */
export function arrivalDelays(
  rowIds: string[],
  known: Set<string> | null,
  animateFirst: boolean
): Map<string, number> {
  const delays = new Map<string, number>();
  if (known === null) {
    if (!animateFirst) return delays;
    rowIds.forEach((id, index) =>
      delays.set(id, HEADER_LEAD_MS + index * ARRIVAL_STAGGER_MS)
    );
    return delays;
  }
  let step = 0;
  for (const id of rowIds) {
    if (known.has(id)) continue;
    delays.set(id, step * ARRIVAL_STAGGER_MS);
    step += 1;
  }
  return delays;
}
