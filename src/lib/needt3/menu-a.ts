/**
 * Phone menu A, "Card" (prototype nav-a.jsx): the pure geometry and decisions.
 *
 * At rest a pill; a finger or a tap grows it into a card, then to full; a pull
 * below the pill tucks it away to a handle. Two springs draw it: `p` (-1 handle,
 * 0 pill, 1 card, past 1 a rubber band) and `t` (card height -> full height).
 * Everything here is numbers in, numbers out; the component writes the result
 * to `transform`, `opacity` and `clip-path` through refs (rule 12, the phone
 * perf fix), never through React state and never as a size or radius.
 *
 * Ported without the in-card Settings list (prototype `u` spring, `NvaSettings`):
 * the Settings sheet opens through the UI store instead.
 */

export type NvaMode = "hidden" | "pill" | "card" | "full";

/** Room kept above the card at full: the status bar. */
export const NVA_TOP = 58;
/** The create button beside the pill: a little smaller than the pill (64). */
export const NVA_ADD = 54;
export const NVA_ADD_GAP = 8;

export const nvaClamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const nvaLerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const nvaUnit = (v: number) => nvaClamp(v, 0, 1);

export interface NvaGeom {
  /** The frame's box. */
  fw: number;
  fh: number;
  /** Side and bottom margin of the whole menu. */
  M: number;
  /** Menu width (frame minus margins). */
  W: number;
  /** Height at full. */
  fullH: number;
  /** Height at the card stop. */
  cardH: number;
  /** Pill, handle: width, height, distance from the bottom. */
  PW: number;
  PH: number;
  PB: number;
  HW: number;
  HH: number;
  HB: number;
  /** One tile's width in the card. */
  tileW: number;
  /** Track length from the pill to the card. */
  range: number;
}

export function nvaGeom(fw: number, fh: number): NvaGeom {
  const M = 10;
  const W = fw - 2 * M;
  const fullH = fh - NVA_TOP - M;
  const cardH = Math.min(fullH, 478);
  const PW = 236;
  const PH = 64;
  const PB = 28;
  const HW = 64;
  const HH = 22;
  const HB = 18;
  const tileW = (W - 28 - 16) / 3;
  return {
    fw,
    fh,
    M,
    W,
    fullH,
    cardH,
    PW,
    PH,
    PB,
    HW,
    HH,
    HB,
    tileW,
    range: cardH - PH,
  };
}

export interface NvaBox {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/**
 * The shape (a rect and a radius, in the menu's own coordinates) at p / t.
 * It is cut out of one full-height layer with clip-path, so the morph never
 * lays the content out again.
 */
export function nvaShape(g: NvaGeom, p: number, t: number): NvaBox {
  let w: number;
  let h: number;
  let b: number;
  let r: number;
  if (p >= 0) {
    const pc = Math.min(p, 1);
    const over = Math.max(0, p - 1);
    const ew = 1 - Math.pow(1 - pc, 1.7); // the width leads ...
    const eh = Math.pow(pc, 1.12); // ... the height follows
    const ch = nvaLerp(g.cardH, g.fullH, t);
    w = nvaLerp(g.PW, g.W, ew);
    h = nvaLerp(g.PH, ch, eh) + over * 140;
    b = nvaLerp(g.PB - g.M, 0, eh);
    r = nvaLerp(g.PH / 2, 38, Math.min(1, pc * 1.4)) - t * 6;
  } else {
    const q = Math.min(-p, 1);
    const under = Math.max(0, -p - 1);
    w = nvaLerp(g.PW, g.HW, q);
    h = nvaLerp(g.PH, g.HH, q);
    b = nvaLerp(g.PB - g.M, g.HB - g.M, q) - under * 14;
    r = h / 2;
  }
  const x = (g.W - w) / 2;
  const y = g.fullH - b - h;
  return { x, y, w, h, r };
}

/** The shape as `clip-path: inset(... round r)` (the only thing that resizes). */
export function nvaClipPath(g: NvaGeom, s: NvaBox) {
  return (
    `inset(${s.y.toFixed(2)}px ${(g.W - s.x - s.w).toFixed(2)}px ` +
    `${(g.fullH - s.y - s.h).toFixed(2)}px ${s.x.toFixed(2)}px round ${s.r.toFixed(2)}px)`
  );
}

/** Where icon i sits in the pill. */
export function nvaPillSlot(g: NvaGeom, i: number) {
  return {
    x: (g.W - g.PW) / 2 + 34 + i * 54,
    y: g.fullH - (g.PB - g.M) - g.PH / 2,
  };
}

/** Where icon i sits in the card's tile row (dy = below the shape's top edge). */
export function nvaTileSlot(g: NvaGeom, i: number) {
  return { x: 14 + g.tileW / 2 + i * (g.tileW + 8), dy: 22 + 32 };
}

/** `translate(x, y) scale(k)` with the fixed digits every write uses. */
export function nvaTransform(x: number, y: number, scale?: number) {
  const t = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
  return scale === undefined ? t : `${t} scale(${scale.toFixed(3)})`;
}

/* ───────────────────────── the track a finger moves along ───────────────── */

/** Px of travel from the pill to the card, then from the card to full. */
export function nvaTall(g: NvaGeom) {
  return g.fullH - g.cardH;
}

/** Rubber band: x past the edge, eased so it slows but never stops dead; d is the limit. */
export const nvaRubber = (x: number, d: number) =>
  (1 - 1 / ((x * 0.55) / d + 1)) * d;

/**
 * The finger's travel (px, + up from the pill) as spring values. The first
 * `range` px open the pill into the card, the next `fullH - cardH` grow the
 * card to full. Past full a short rubber band (24 px at most, short of the
 * status bar text) stretches the card; below the pill the finger meets a stiff
 * band: ~150 px of pull reaches the handle.
 */
export function nvaTrackToSprings(g: NvaGeom, px: number) {
  const tall = nvaTall(g);
  const top = g.range + tall;
  if (px > top) return { p: 1 + nvaRubber(px - top, 24) / 140, t: 1 };
  if (px > g.range) return { p: 1, t: (px - g.range) / tall };
  return { p: px >= 0 ? px / g.range : -1.22 * (1 - Math.exp(px / 150)), t: 0 };
}

/** Where the springs are now, on the same track (the inverse of the above). */
export function nvaSpringsToTrack(g: NvaGeom, p: number, t: number) {
  if (p < 0) return 150 * Math.log(1 - Math.min(-p / 1.22, 0.999));
  return Math.min(p, 1) * g.range + nvaUnit(t) * nvaTall(g);
}

/**
 * The springs under a drag. `fy` is how far the finger has moved (+ down) from
 * where it took hold, `px0` the track position it took hold at. From the
 * tucked-away handle the first 90 px per unit pull it out to the pill.
 */
export function nvaDragSprings(
  g: NvaGeom,
  from: NvaMode,
  px0: number,
  fy: number
) {
  if (from === "hidden") {
    const raw = -1 - fy / 90;
    if (raw <= 0) return { p: Math.max(-1.15, raw), t: 0 };
    return nvaTrackToSprings(g, raw * 90);
  }
  return nvaTrackToSprings(g, px0 - fy);
}

/** A position on the track as a stop count: -1 handle, 0 pill, 1 card, 2 full. */
export function nvaStopOf(g: NvaGeom, px: number) {
  const tall = nvaTall(g);
  return px <= g.range ? px / g.range : 1 + (px - g.range) / tall;
}

export interface NvaRelease {
  /** The stop to settle at. */
  mode: NvaMode;
  /** Where the finger let go, in stops. */
  z: number;
  /** Where its velocity projects to, in stops. */
  proj: number;
  /** Initial spring velocities (p-units and t-units per second). */
  vp: number;
  vt: number;
}

/**
 * Letting go: project the finger's speed along the track (-1 handle, 0 pill,
 * 1 card, 2 full) and take the stop it lands nearest to, so a flick can skip
 * one. The pill opens at a short pull, and the card and the handle keep the
 * bias they had before full existed (a card closes past 40 %, the handle
 * needs a hard pull). `vy` is the finger's velocity in px/ms, + down.
 */
export function nvaRelease(
  g: NvaGeom,
  r: { from: NvaMode; p: number; t: number; vy: number }
): NvaRelease {
  const tall = nvaTall(g);
  const vpx = -r.vy * 1000; // px/s, + up
  let z: number;
  let proj: number;
  if (r.p < 0) {
    z = r.p;
    proj = z + (vpx * 0.16) / g.range;
  } else {
    const px = nvaSpringsToTrack(g, r.p, r.t);
    z = nvaStopOf(g, px);
    proj = nvaStopOf(g, px + vpx * 0.16);
  }
  let mode: NvaMode;
  if (r.from === "hidden")
    mode =
      r.p > 0.15 && proj > 0.5
        ? proj > 1.5
          ? "full"
          : "card"
        : proj > -0.6
          ? "pill"
          : "hidden";
  else if (r.from === "pill")
    mode =
      z < -0.55 || proj < -0.7
        ? "hidden"
        : proj > 1.5
          ? "full"
          : proj > 0.22
            ? "card"
            : "pill";
  else if (r.from === "card")
    mode =
      proj > 1.5
        ? "full"
        : proj > 0.6
          ? "card"
          : proj > -0.5
            ? "pill"
            : "hidden";
  else
    mode =
      proj > 1.5
        ? "full"
        : proj > 0.6
          ? "card"
          : proj > -0.5
            ? "pill"
            : "hidden";
  return {
    mode,
    z,
    proj,
    vp: z <= 1 ? nvaClamp(vpx / g.range, -9, 9) : 0,
    vt: z > 1 ? nvaClamp(vpx / tall, -9, 9) : 0,
  };
}

/** The spring targets of a stop. */
export function nvaTargets(mode: NvaMode) {
  return {
    p: mode === "hidden" ? -1 : mode === "pill" ? 0 : 1,
    t: mode === "full" ? 1 : 0,
  };
}

/** The hint above the shape while a pull goes below the pill. */
export function nvaHint(p: number): "more" | "tuck" | null {
  const q = -p;
  return q > 0.04 ? (q > 0.55 ? "tuck" : "more") : null;
}

/** Where a drag that started in a list goes: the list scrolls, or the card moves. */
export function nvaDragKind(r: {
  canScroll: boolean;
  dy: number;
  scrollTop: number;
  t: number;
}): "scroll" | "drag" {
  // Down: the list goes back to its top first, then the card follows.
  // Up: the card grows to full first; only at full does the list scroll.
  return r.canScroll &&
    ((r.dy > 0 && r.scrollTop > 0) || (r.dy < 0 && r.t > 0.98))
    ? "scroll"
    : "drag";
}

/* ───────────────────────── one frame ───────────────────────────────────── */

export interface NvaIconFrame {
  /** translate target (top-left of the 52 px box) and scale. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface NvaFrame {
  shape: NvaBox;
  clip: string;
  /** 0 pill .. 1 card. */
  open: number;
  icons: NvaIconFrame[];
  pillbits: { x: number; y: number; opacity: number };
  dotsOpacity: number;
  glass: { x: number; y: number; sx: number; sy: number; opacity: number };
  add: { x: number; y: number; scale: number; opacity: number };
  handle: { x: number; y: number; opacity: number };
  contentY: number;
  tiles: { opacity: number; y: number; scale: number };
  grabOpacity: number;
  rowsVisible: boolean;
  scrimOpacity: number;
  hintY: number;
  /** The height of the list's window, between the card and full. */
  visH: number;
}

/** A row's staggered progress: every row is fully in by the time the card is open. */
export function nvaRowK(open: number, i: number) {
  return nvaUnit((open - 0.35 - Math.min(i, 6) * 0.04) / 0.4);
}

/** The fog under the shape's bottom edge: only while there is more to scroll. */
export function nvaFogK(open: number, more: number) {
  return nvaUnit((open - 0.55) / 0.45) * nvaUnit(more / 60);
}

/** The soft edge under the pinned tiles shows once the list is scrolled under them. */
export function nvaHeadK(scrollTop: number, tilesOpacity: number) {
  return nvaUnit(scrollTop / 24) * tilesOpacity;
}

/**
 * Everything that moves, at (p, t). `glass` is the box the pill's glass layer
 * was sized to for the stop it rests at (the pill, or the handle).
 */
export function nvaFrame(
  g: NvaGeom,
  p: number,
  t: number,
  glass: { w: number; h: number },
  iconCount = 3
): NvaFrame {
  const s = nvaShape(g, p, nvaUnit(t));
  const open = nvaUnit(p);
  const q = nvaUnit(-p);
  const eIcon = open < 1 ? 1 - Math.pow(1 - open, 2.2) : 1;

  const icons: NvaIconFrame[] = [];
  for (let i = 0; i < iconCount; i++) {
    const ps = nvaPillSlot(g, i);
    const ts = nvaTileSlot(g, i);
    const y = p >= 0 ? s.y + nvaLerp(g.PH / 2, ts.dy, eIcon) : s.y + s.h / 2;
    let x = nvaLerp(ps.x, ts.x, eIcon);
    let scale = nvaLerp(1, 1.36, eIcon);
    let opacity = 1;
    if (p < 0) {
      x = nvaLerp(ps.x, g.W / 2 + (i - 1) * 10, q);
      scale = 1 - 0.55 * q;
      opacity = nvaUnit(1 - q * 1.7);
    }
    icons.push({ x: x - 26, y: y - 26, scale, opacity });
  }

  const pillOp = p >= 0 ? nvaUnit(1 - open * 3.2) : nvaUnit(1 - q * 1.8);
  const glassK = p >= 0 ? nvaUnit(1 - open * 1.4) : 1;
  const tilesK = nvaUnit((open - 0.35) / 0.55);
  const visH = Math.max(g.cardH, Math.min(s.h, g.fullH));

  return {
    shape: s,
    clip: nvaClipPath(g, s),
    open,
    icons,
    pillbits: {
      x: s.x + s.w - 60,
      y: s.y + s.h / 2 - 22,
      opacity: pillOp,
    },
    dotsOpacity: nvaUnit(1 - (p >= 0 ? 0 : q * 1.4)),
    glass: {
      x: g.M + s.x,
      y: g.fh - g.M - g.fullH + s.y,
      sx: s.w / glass.w,
      sy: s.h / glass.h,
      opacity: glassK,
    },
    add: {
      x: g.M + s.x + s.w + NVA_ADD_GAP,
      y: g.fh - g.M - g.fullH + s.y + (s.h - NVA_ADD) / 2,
      scale: nvaLerp(0.6, 1, pillOp),
      opacity: pillOp,
    },
    handle: {
      x: s.x + s.w / 2 - 14,
      y: s.y + s.h / 2 - 1.5,
      opacity: nvaUnit((q - 0.55) / 0.45),
    },
    contentY: s.y,
    tiles: {
      opacity: tilesK,
      y: (1 - tilesK) * 10,
      scale: nvaLerp(0.94, 1, tilesK),
    },
    grabOpacity: nvaUnit((open - 0.6) / 0.4),
    rowsVisible: open >= 0.3,
    scrimOpacity: open * nvaLerp(1, 1.25, nvaUnit(t)),
    hintY: s.y - 46,
    visH,
  };
}

/** Visible below this opacity is not worth a layer: the part is hidden outright. */
export const NVA_HIDE_BELOW = 0.02;
