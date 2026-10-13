/**
 * Tooltip timing, shared by the `Tooltip` component and the native `title`
 * replacement. Craft's rule: a tip waits before it appears, but once one has
 * just been seen the next one (a neighbour, a row over) opens at once.
 */

/** Hover time before the first tip appears. */
export const TIP_SHOW_MS = 600;
/** After a tip closes, a tip that opens within this window skips the wait. */
export const TIP_GROUP_MS = 300;

/** When a visible tip was last dismissed by the pointer leaving (ms, clock). */
let lastHiddenAt: number | null = null;

export function noteTipHidden(now: number) {
  lastHiddenAt = now;
}

/** Test seam: forget the last dismissal. */
export function resetTipClock() {
  lastHiddenAt = null;
}

/** How long to wait before showing a tip that the pointer just reached. */
export function tipDelay(now: number): number {
  return lastHiddenAt !== null && now - lastHiddenAt <= TIP_GROUP_MS
    ? 0
    : TIP_SHOW_MS;
}
