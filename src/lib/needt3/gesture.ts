/**
 * The decisions inside the phone's gestures (prototype phone-kit.jsx PkRow,
 * PkSheet, PkPullDown, PkHold), pure so they are tested apart from the DOM.
 * The components feed them pointer samples and write the result to a
 * `transform` through a ref; nothing here touches the DOM or the clock.
 */
import { rubber } from "./spring";

/** `[time ms, position px]` */
export type Sample = readonly [number, number];

/** Keep only the last `windowMs` of samples (at least two) and add one. */
export function pushSample(
  samples: Sample[],
  t: number,
  pos: number,
  windowMs = 90
) {
  samples.push([t, pos]);
  while (samples.length > 2 && t - samples[0][0] > windowMs) samples.shift();
  return samples;
}

/** Speed over the samples in px/ms, positive toward larger positions. */
export function velocity(samples: readonly Sample[]) {
  if (samples.length < 2) return 0;
  const a = samples[0];
  const b = samples[samples.length - 1];
  return b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
}

/** Which way a press that has moved is going: not yet, a swipe, or something else (a scroll). */
export function axisOf(dx: number, dy: number, slop = 8, ratio = 1.2) {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) * ratio ? "x" : "y";
}

/* ---------- row swipe ---------- */

export const SWIPE_AT = 92;
export type SwipeSide = "done" | "later";

export interface SwipeAllow {
  canDone?: boolean;
  canLater?: boolean;
}

export const sideOf = (dx: number): SwipeSide => (dx > 0 ? "done" : "later");
const allowed = (side: SwipeSide, a: SwipeAllow) =>
  side === "done" ? !!a.canDone : !!a.canLater;

/**
 * Where the row sits for a finger offset: 1:1 to the threshold, then a
 * rubber band; a side that cannot act only gives a short rubber (18 px).
 */
export function swipeOffset(dx: number, a: SwipeAllow, at = SWIPE_AT) {
  const m = Math.abs(dx);
  const s = dx < 0 ? -1 : 1;
  if (!allowed(sideOf(dx), a)) return s * rubber(m, 18);
  return s * (m <= at ? m : at + rubber(m - at, 56));
}

/** How far the reveal behind the row shows, 0..1. */
export function swipeReveal(dx: number, a: SwipeAllow, at = SWIPE_AT) {
  return allowed(sideOf(dx), a) ? Math.min(1, Math.abs(dx) / at) : 0;
}

/** Armed (past the threshold) toward a side that can act, else null. */
export function swipeArmed(dx: number, a: SwipeAllow, at = SWIPE_AT) {
  const side = sideOf(dx);
  return allowed(side, a) && Math.abs(dx) >= at ? side : null;
}

/** On release: the side to commit, or null. A flick counts. */
export function swipeCommit(
  dx: number,
  v: number,
  a: SwipeAllow,
  at = SWIPE_AT
) {
  const side = sideOf(dx);
  if (!allowed(side, a)) return null;
  const s = dx < 0 ? -1 : 1;
  return Math.abs(dx) >= at ||
    (Math.abs(dx) > 36 && Math.abs(v) > 0.55 && Math.sign(v) === s)
    ? side
    : null;
}

/**
 * What a released row swipe commits. A cancelled gesture (a real
 * pointercancel, or a hold that took the finger) commits nothing, whatever
 * the pointer last said; an "up" uses the last move's offset `dx` (the up
 * event's own coordinates are not trusted) and the velocity of the samples.
 */
export function swipeRelease(
  reason: "up" | "cancel",
  dx: number,
  v: number,
  a: SwipeAllow,
  at = SWIPE_AT
) {
  return reason === "cancel" ? null : swipeCommit(dx, v, a, at);
}

/* ---------- sheet ---------- */

/** The offset below the open position for a drag: 1:1 down, rubber past the top. */
export function sheetOffset(raw: number) {
  return raw >= 0 ? raw : -rubber(-raw, 40);
}

/**
 * Stops (px below the open position) from the highest down; the last is shut.
 * `detents` are fractions of the layer height `layerH`, `sheetH` the sheet's
 * own height.
 */
export function sheetStops(
  sheetH: number,
  layerH: number,
  detents: readonly number[] | null
) {
  const shut = sheetH + 24;
  if (!detents || !detents.length) return [0, shut];
  const ds = [...detents].sort((a, b) => a - b);
  const top = ds[ds.length - 1];
  return [...ds]
    .reverse()
    .map((d) => Math.max(0, (top - d) * layerH))
    .concat([shut]);
}

/** Where the sheet rests when it opens: the first detent. */
export function firstStop(layerH: number, detents: readonly number[] | null) {
  if (!detents || !detents.length) return 0;
  const ds = [...detents].sort((a, b) => a - b);
  return Math.max(0, (ds[ds.length - 1] - ds[0]) * layerH);
}

/**
 * Where a released sheet settles: the stop nearest the projected position
 * (speed over 180 ms); a clear flick down from the lowest detent closes.
 * `v` is px/ms, positive downward.
 */
export function sheetSettle(y: number, v: number, stops: readonly number[]) {
  const projected = y + v * 180;
  let best = stops[0];
  for (const p of stops)
    if (Math.abs(p - projected) < Math.abs(best - projected)) best = p;
  const last = stops[stops.length - 1];
  const lowest = stops.length > 1 ? stops[stops.length - 2] : 0;
  if (v > 0.9 && y > lowest - 4) best = last;
  return { stop: best, closes: best === last };
}

/**
 * Where a sheet whose drag was cancelled rests: the open stop nearest to where
 * it is, never the shut one (a cancel must not close it).
 */
export function sheetRestStop(y: number, stops: readonly number[]) {
  const open = stops.length > 1 ? stops.slice(0, -1) : [stops[0] ?? 0];
  let best = open[0];
  for (const p of open) if (Math.abs(p - y) < Math.abs(best - y)) best = p;
  return best;
}

/** How far a footer rides up so it stays on screen at a lower detent. */
export function footerPin(
  y: number,
  layerH: number,
  detents: readonly number[] | null
) {
  if (!detents || detents.length < 2) return 0;
  const ds = [...detents].sort((a, b) => a - b);
  const low = (ds[ds.length - 1] - ds[0]) * layerH;
  return low > 0 ? Math.max(0, Math.min(low, y)) : 0;
}

/** The clip-path the morph (a sheet growing out of the pill) draws at `k` (0 = the rect, 1 = the sheet). */
export interface MorphRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}
export function morphClip(
  k: number,
  r: MorphRect,
  sheetH: number,
  layerH: number,
  layerW: number
) {
  const kk = Math.max(0, Math.min(1.06, k));
  const lerp = (a: number, b: number) => a + (b - a) * kk;
  const top0 = r.y - (layerH - sheetH);
  const f = (n: number) => Math.max(0, n).toFixed(1);
  const t = f(lerp(top0, 0));
  const b = f(lerp(layerH - r.y - r.h, 0));
  const l = f(lerp(r.x, 0));
  const rt = f(lerp(layerW - r.x - r.w, 0));
  const rTop = f(lerp(r.r, 34));
  const rBot = f(lerp(r.r, 0));
  return `inset(${t}px ${rt}px ${b}px ${l}px round ${rTop}px ${rTop}px ${rBot}px ${rBot}px)`;
}

/* ---------- pull-down ---------- */

export const PULL_ARM = 96;

/** The plate's y for a finger offset: 1:1 to its height, then a rubber band. */
export function pullOffset(raw: number, height: number) {
  return raw <= 0 ? 0 : raw <= height ? raw : height + rubber(raw - height, 70);
}

/** On release: open or shut. `v` is px/ms, positive downward. */
export function pullSettle(
  open: boolean,
  y: number,
  v: number,
  height: number
) {
  return open
    ? !(y < height - 60 || v < -0.5)
    : y >= PULL_ARM || (v > 0.5 && y > 30);
}

/* ---------- hold ---------- */

export const HOLD_MS = 450;
export const HOLD_SLOP = 8;
/** A hold is cancelled once the finger has travelled more than the slop. */
export const holdMoved = (dx: number, dy: number) =>
  Math.hypot(dx, dy) > HOLD_SLOP;
