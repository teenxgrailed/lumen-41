/**
 * Slides one task row from where it was to where it is now (FLIP), for the
 * first replan: after Keep the demo task lands in its new slot, and the row
 * travels there instead of jumping.
 *
 * Positions are measured from the bottom of the first-replan card, not from
 * the page, so the card changing height or a banner appearing above the list
 * is not counted as the row moving. Transform and opacity only; a person who
 * prefers reduced motion gets no animation at all (the CSS reduced-motion
 * rule does not reach the Web Animations API, so it is checked here).
 */

export const ROW_FLIP_MS = 220;

const ANCHOR = "[data-hd-first-replan]";

function rowOf(id: string): HTMLElement | null {
  // Desktop rows carry data-task, phone rows data-pk-row.
  return document.querySelector<HTMLElement>(
    `[data-task="${id}"], [data-pk-row="${id}"]`
  );
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Where the row sits now, relative to the card; null when it is not on screen. */
export function measureRow(id: string): number | null {
  const row = rowOf(id);
  const anchor = document.querySelector(ANCHOR);
  if (!row || !anchor) return null;
  return (
    row.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom
  );
}

/**
 * Animates the row from `before` (from `measureRow`) to where it is now.
 * Returns true when an animation started.
 */
export function flipRow(id: string, before: number | null): boolean {
  if (before === null || prefersReducedMotion()) return false;
  const after = measureRow(id);
  const row = rowOf(id);
  if (after === null || !row || typeof row.animate !== "function") {
    return false;
  }
  const dy = before - after;
  if (Math.abs(dy) < 2) return false;
  row.animate(
    [
      { transform: `translateY(${dy}px)`, opacity: 0.55 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: ROW_FLIP_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" }
  );
  return true;
}
