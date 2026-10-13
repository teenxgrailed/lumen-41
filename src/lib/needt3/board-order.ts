/**
 * The order of a board's references, pure. The same rule the items route
 * applies (`reorderMoodboardItems`): the listed ids take, in the listed order,
 * the places the listed ids held; anything else stays where it is. The hook
 * uses it for the optimistic write, the faces use it to preview a drag.
 */
export function applyOrderSlots(
  ids: readonly string[],
  order: readonly string[]
): string[] {
  const listed = new Set(order);
  const next = [...ids];
  let k = 0;
  ids.forEach((id, i) => {
    if (listed.has(id) && k < order.length) next[i] = order[k++];
  });
  return next;
}

/** Move `id` so it sits at `toIndex` of the list (clamped); the list is not changed. */
export function moveId(
  ids: readonly string[],
  id: string,
  toIndex: number
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  return next;
}

export function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
