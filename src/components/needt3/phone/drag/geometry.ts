/**
 * Where a lifted row's gap may open, and what slides out of its way: the pure
 * half of phone-drag.jsx (`pdCandidates`, `pdShift`, the nearest-gap rule,
 * the edge scroll). No DOM here, only numbers in the list's own px (the
 * screen's scale divided out), so the rules are provable without a browser.
 */

export type ZoneMode = "move" | "reorder" | "none";

/** One thing a drag moves around: a section head, a row, a "Show more". */
export interface Token {
  kind: "row" | "head" | "other";
  zone: string | null;
  mode: ZoneMode;
  /** A folded section takes a drop on its head and opens no gap. */
  folded: boolean;
  /** The task id of a row. */
  id: string | null;
  /** Top within the list, px, as laid out with the source row still in place. */
  top: number;
  h: number;
}

/** What a drag knows about its source row and the list around it. */
export interface DragFrame<T extends Token = Token> {
  /** Every token except the source, in order. */
  T: readonly T[];
  /** Where the source sat among all tokens (its index with itself counted). */
  si: number;
  /** The source row's height. */
  H: number;
  srcTop: number;
  /** The zone the row came from and that zone's mode. */
  from: string | null;
  fromMode: ZoneMode;
}

export interface Candidate<T extends Token = Token> {
  /** 1-based: the gap opens after `T[q - 1]`. */
  q: number;
  zone: string;
  home?: boolean;
  folded?: boolean;
  /** The folded section's head, for a drop that sinks into it. */
  head?: T;
  gapTop: number;
  /** The gap's centre, what the finger is measured against. */
  anchor: number;
  after: string | null;
  before: string | null;
}

/**
 * Every place the gap may open: after a head or a row of a zone that takes
 * this row (its own zone when it reorders, a "move" zone otherwise). Home —
 * where the row came from — is always among them.
 */
export function candidates<T extends Token>(s: DragFrame<T>): Candidate<T>[] {
  const { T, si, H } = s;
  const out: Candidate<T>[] = [];
  for (let q = 1; q <= T.length; q++) {
    const p = T[q - 1];
    if (p.kind === "other" || !p.zone) continue;
    const own = p.zone === s.from;
    const home = q === si;
    if (!home) {
      if (own && s.fromMode === "none") continue;
      if (!own && p.mode !== "move") continue;
    }
    if (p.folded) {
      if (p.kind !== "head" || own) continue;
      out.push({
        q,
        zone: p.zone,
        folded: true,
        head: p,
        gapTop: p.top,
        anchor: p.top + p.h / 2,
        after: null,
        before: null,
      });
      continue;
    }
    const gapTop = home ? s.srcTop : q < si ? p.top + p.h : p.top + p.h - H;
    const next = q < T.length ? T[q] : null;
    out.push({
      q,
      zone: p.zone,
      home,
      gapTop,
      anchor: gapTop + H / 2,
      after: p.kind === "row" ? p.id : null,
      before:
        next && next.kind === "row" && next.zone === p.zone ? next.id : null,
    });
  }
  if (!out.some((c) => c.home))
    out.push({
      q: si,
      zone: s.from ?? "",
      home: true,
      gapTop: s.srcTop,
      anchor: s.srcTop + H / 2,
      after: null,
      before: null,
    });
  return out;
}

/** The candidate whose gap is nearest `cy`, or home when the finger is out of the list. */
export function nearest<T extends Token>(
  cands: readonly Candidate<T>[],
  cy: number,
  out: boolean
): Candidate<T> | undefined {
  if (out) return cands.find((c) => c.home);
  let best: Candidate<T> | undefined;
  let bd = Infinity;
  for (const c of cands) {
    const d = Math.abs(c.anchor - cy);
    if (d < bd) {
      best = c;
      bd = d;
    }
  }
  return best ?? cands.find((c) => c.home);
}

/**
 * How far token `k` of `T` slides while the gap sits after `T[q - 1]`: the
 * ones between home and the gap give way by one row's height, so the gap
 * travels with the finger. A folded target (or no target) moves nothing.
 */
export function shiftOf(k: number, si: number, q: number, H: number) {
  if (q > si && k >= si && k < q) return -H;
  if (q < si && k >= q && k < si) return H;
  return 0;
}

/** px per frame the list scrolls while the finger is within the edge zones. */
export const EDGE_TOP = 116;
export const EDGE_BOTTOM = 140;
export const EDGE_SPEED = 12;

export function scrollSpeed(y: number, top: number, bottom: number) {
  if (y < top + EDGE_TOP)
    return -Math.min(1, (top + EDGE_TOP - y) / EDGE_TOP) * EDGE_SPEED;
  if (y > bottom - EDGE_BOTTOM)
    return Math.min(1, (y - (bottom - EDGE_BOTTOM)) / EDGE_BOTTOM) * EDGE_SPEED;
  return 0;
}

/** Is the finger outside the list (beyond 8 px of its sides, or past its ends)? */
export function isOut(
  x: number,
  y: number,
  r: { left: number; right: number; top: number; bottom: number }
) {
  return x < r.left - 8 || x > r.right + 8 || y < r.top || y > r.bottom;
}

/** The lean of the lifted card: follows sideways travel, damped, clamped to ±3°. */
export function lean(prev: number, dx: number) {
  return Math.max(-3, Math.min(3, prev * 0.75 + dx * 0.3));
}
