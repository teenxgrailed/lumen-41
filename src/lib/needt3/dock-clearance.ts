/**
 * Does the page's last row clear the floating dock when the page is scrolled
 * to its end?
 *
 * The CSS answers it from numbers (phone-ground.css: the tail is the dock's
 * top edge `--v3-dock-top` plus 42 px, or the fog plus 16 px, plus the gap
 * between the large and the dynamic viewport in the installed app). Those
 * numbers assume the dock is anchored to the bottom of what the document
 * scrolls against. In the installed app on iOS that is not guaranteed: the
 * layout viewport (what `position: fixed` hangs from, `innerHeight`) was
 * measured at 812 pt on an 874 pt screen, so the dock stood up to 62 pt
 * higher than the scroll end. This reads the real positions instead and says
 * how much more tail the page needs, so it ends above the dock whatever the
 * viewport does.
 *
 * Pure: `useDockClearance` takes the readings and writes the result.
 */

/** The last row ends at least this far above the dock's top edge. */
export const DOCK_CLEAR_MARGIN_PX = 12;

/** More than this is not a viewport quirk but a bad reading; ignore it. */
export const DOCK_CLEAR_MAX_EXTRA_PX = 160;

/** Smaller moves are not worth a layout. */
const STEP_PX = 2;

export interface DockReading {
  /** The dock's top edge, viewport px (`getBoundingClientRect().top`). */
  dockTop: number;
  /** The top edge of the page's tail (its first pixel past the last row), viewport px. */
  tailTop: number;
  /** `window.scrollY`. */
  scrollY: number;
  /** The document's `scrollHeight`. */
  scrollHeight: number;
  /**
   * The height of the visible area: the larger of `innerHeight` and
   * `visualViewport.height + offsetTop` (the keyboard only makes the second
   * smaller).
   */
  visibleHeight: number;
  /** The extra tail the page carries now (what this returned last time). */
  extra: number;
}

/**
 * Where the last row ends at the bottom of the page, in viewport px: the
 * tail's top edge in the document, less how far the page can scroll.
 */
export function lastRowAtEnd(r: DockReading): number {
  const scrollMax = Math.max(0, r.scrollHeight - r.visibleHeight);
  return r.tailTop + r.scrollY - scrollMax;
}

/**
 * The extra tail (px) the page needs so that, scrolled to its end, the last
 * row stands at least `margin` above the dock's top edge. `reading.extra`
 * (already part of the tail) is kept in the answer, so asking again after
 * applying it returns the same number.
 */
export function tailExtra(
  r: DockReading,
  margin: number = DOCK_CLEAR_MARGIN_PX
): number {
  const over = lastRowAtEnd(r) - (r.dockTop - margin);
  const next = Math.min(
    DOCK_CLEAR_MAX_EXTRA_PX,
    Math.max(0, Math.ceil(r.extra + over))
  );
  return Math.abs(next - r.extra) < STEP_PX ? r.extra : next;
}
