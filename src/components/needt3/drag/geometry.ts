/* The drag's pure geometry — snapping, target resolution, what the tag says.
 *
 * Reused from the September port (`needt/interaction/drag/geometry.ts`, the
 * same Drag.jsx contract) rather than retyped. v3 imports it only through
 * this file, so the contract step that deletes `src/components/needt/**`
 * moves one file here instead of chasing imports.
 */
export {
  DRAG_SNAP_HOURS,
  DRAG_THRESHOLD_PX,
  type DropAttrs,
  type DropTarget,
  formatDragTime,
  resolveDropTarget,
  sameDropTarget,
  snapDragTime,
  timelineTimeAt,
} from "@/components/needt/interaction/drag/geometry";

/** The edge band (px) where a drag scrolls its grid, and the top speed. */
export const EDGE_PX = 56;
export const EDGE_SPEED = 14;

/**
 * How far a scroller moves this frame for a pointer at `y`: negative near the
 * top, positive near the bottom, faster the deeper into the band; 0 outside.
 */
export function edgeScroll(y: number, top: number, bottom: number) {
  if (y > bottom - EDGE_PX)
    return ((y - (bottom - EDGE_PX)) / EDGE_PX) * EDGE_SPEED;
  if (y < top + EDGE_PX) return ((y - (top + EDGE_PX)) / EDGE_PX) * EDGE_SPEED;
  return 0;
}

/** The lean of the lifted card: the pointer's x-velocity, decaying, ±3°. */
export function nextLean(lean: number, dx: number, calm: boolean) {
  if (calm) return 0;
  return Math.max(-3, Math.min(3, lean * 0.8 + dx * 0.25));
}

export interface SortRow {
  /** Top (px) relative to the list's top, and height. */
  top: number;
  h: number;
}

/**
 * Where the gap is in a sortable list: the row index whose place the item
 * would take, or -1 when the item's centre is outside the list. `cy` and
 * `listTop` are viewport px; rows are measured once at lift.
 */
export function sortIndexAt(
  rows: readonly SortRow[],
  home: number,
  cx: number,
  cy: number,
  list: { left: number; right: number; top: number; bottom: number },
  pitch: number
) {
  const inside =
    cx > list.left - 32 &&
    cx < list.right + 32 &&
    cy > list.top - pitch / 2 &&
    cy < list.bottom + pitch / 2;
  if (!inside) return -1;
  const rel = cy - list.top;
  let j = home;
  for (let k = home + 1; k < rows.length; k++)
    if (rel > rows[k].top + rows[k].h / 2) j = k;
  for (let k = home - 1; k >= 0; k--)
    if (rel < rows[k].top + rows[k].h / 2) j = k;
  return j;
}

/** The vertical shift (px) of list child `idx` while the gap moves home → to. */
export function shiftFor(idx: number, from: number, to: number, pitch: number) {
  if (to > from && idx > from && idx <= to) return -pitch;
  if (to < from && idx >= to && idx < from) return pitch;
  return 0;
}
