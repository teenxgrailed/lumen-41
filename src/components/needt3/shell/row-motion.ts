/**
 * The one hand-off between the shell's row and the page beside the rail and
 * the Ask dock.
 *
 * Hiding the rail or opening the dock changes a column's width once, in the
 * commit that toggles it, and never animates that width (a width transition
 * re-lays-out the page, and every ResizeObserver in it, on every frame). The
 * motion is a transform or clip on the page (`.shell-app-stack`), played by
 * CSS from a value written on the row at the same moment: this attribute.
 * Writing it from a layout effect puts it in the same frame as the new width.
 *
 * One attribute, not one per column: when the rail and the dock both move,
 * the later write wins and the earlier animation is not left in effect.
 * Consecutive writes always differ (a column alternates in/out), so every
 * toggle restarts the animation. See src/styles/v3-overrides/shell-motion.css.
 */
export type RowMotion = "rail-out" | "rail-in" | "dock-out" | "dock-in";

/** The row that holds the rail, the page and the dock, found from a child. */
export function rowOf(child: Element | null): HTMLElement | null {
  return child ? child.closest<HTMLElement>(".shell-app-row") : null;
}

export function setRowMotion(
  row: HTMLElement | null,
  motion: RowMotion | null
): void {
  if (!row) return;
  if (motion) row.dataset.motion = motion;
  else delete row.dataset.motion;
}
