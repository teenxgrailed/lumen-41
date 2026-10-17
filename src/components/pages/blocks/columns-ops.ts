/** Smallest share of the row one column may shrink to, in percent. */
export const MIN_COLUMN_PERCENT = 15;

export function equalWidths(count: number): number[] {
  const each = Math.round(10000 / count) / 100;
  return Array.from({ length: count }, () => each);
}

/** A width that is a finite number in range; anything else is an even share. */
export function cleanWidth(value: unknown, fallback = 50): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : fallback;
}

/**
 * Drag the divider after column `index` by `delta` percent of the row: the
 * column before it grows and the one after it shrinks by the same amount, each
 * staying at least `MIN_COLUMN_PERCENT` of the row. Other columns do not move.
 */
export function resizeWidths(
  widths: readonly number[],
  index: number,
  delta: number,
  min = MIN_COLUMN_PERCENT
): number[] {
  if (index < 0 || index >= widths.length - 1) return [...widths];
  const total = widths.reduce((sum, w) => sum + w, 0);
  const floor = (total * min) / 100;
  const pair = widths[index] + widths[index + 1];
  const left = Math.min(Math.max(widths[index] + delta, floor), pair - floor);
  const next = [...widths];
  next[index] = Math.round(left * 100) / 100;
  next[index + 1] = Math.round((pair - left) * 100) / 100;
  return next;
}
