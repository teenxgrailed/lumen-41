/** The order logic of every sortable list, pure. */

/** Move `id` to the index `to` (clamped); the input is not changed. */
export function moveTo(
  ids: readonly string[],
  id: string,
  to: number
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
}

/** Move `id` into the place where `overId` is (the gap a drag shows). */
export function moveOnto(
  ids: readonly string[],
  id: string,
  overId: string
): string[] {
  const to = ids.indexOf(overId);
  if (to < 0 || ids.indexOf(id) < 0) return [...ids];
  return moveTo(ids, id, to);
}

export function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * `items` in the order of `order`. Ids missing from `order` keep their
 * relative place after the listed ones; ids in `order` that are gone are
 * skipped, so a stale pending order can never drop or invent a row.
 */
export function applyIds<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[] | null
): T[] {
  if (!order) return [...items];
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  for (const id of order) {
    const it = byId.get(id);
    if (it) {
      out.push(it);
      byId.delete(id);
    }
  }
  for (const it of items) if (byId.has(it.id)) out.push(it);
  return out;
}

/** The place a key moves to: arrows by one, Home and End to the ends. */
export function keyTarget(
  key: string,
  index: number,
  count: number
): number | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(count - 1, index + 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export const sortableText = {
  instructions:
    "Press space to pick up, the arrow keys to move, space to drop, escape to cancel.",
  pickedUp: (name: string, pos: number, n: number) =>
    `${name}, picked up. Position ${pos} of ${n}. Arrow keys move it, space drops it, escape cancels.`,
  moved: (name: string, pos: number, n: number) =>
    `${name}, position ${pos} of ${n}.`,
  dropped: (name: string, pos: number, n: number) =>
    `${name}, dropped at position ${pos} of ${n}.`,
  cancelled: (name: string, pos: number, n: number) =>
    `Cancelled. ${name} is back at position ${pos} of ${n}.`,
  failed: "The new order could not be saved. It is back as it was.",
};
