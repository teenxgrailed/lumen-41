/**
 * Menu A's shadow without a filter on the moving shape (prototype nav-a.jsx
 * `nvaShadowPieces` .. `nvaPaintShadow`), rule 12 of the phone perf fix.
 *
 * `--nva-shadow` (a `drop-shadow()` list in themes.css) is drawn once as
 * `box-shadow` on nine-slice pieces of a rounded rect, one set per corner
 * radius the shape rests at (handle 11, pill and full 32, card 38). A frame
 * only moves and stretches the pieces (transform) and cross-fades the two sets
 * either side of the shape's radius (opacity), so the shadow is exact at every
 * stop. Corners are box-shadow and never stretched; the edges are the same
 * shadow's straight-edge profile as a gradient, which stretches along its
 * length exactly (a stretched box-shadow would be re-blurred in the stretched
 * space). A drop-shadow's blur is a standard deviation, box-shadow's twice
 * that: the blur is doubled.
 */
import { type NvaBox, nvaUnit } from "./menu-a";

export const NVA_SH_R = [11, 32, 38] as const;
/** Room for the widest shadow past the edge (dark: 22 down + 68 blur). */
export const NVA_SH_E = 100;
/** An edge piece's unstretched length. */
export const NVA_SH_U = 8;

export interface ShadowPiece {
  w: number;
  h: number;
  ix: number;
  iy: number;
  big: number;
  /** Which edge a gradient piece draws ("t" | "b" | "l" | "r"), null for a corner. */
  edge: "t" | "b" | "l" | "r" | null;
}

/** The eight pieces of one set: tl tr bl br, then top bottom left right. */
export function nvaShadowPieces(R0: number): ShadowPiece[] {
  const E = NVA_SH_E;
  const U = NVA_SH_U;
  const big = 2 * R0 + 2 * E + 64;
  const C = E + R0;
  const rows: [number, number, number, number][] = [
    [C, C, E, E],
    [C, C, R0 - big, E],
    [C, C, E, R0 - big],
    [C, C, R0 - big, R0 - big],
    [U, E, (U - big) / 2, E],
    [U, E, (U - big) / 2, -big],
    [E, U, E, (U - big) / 2],
    [E, U, -big, (U - big) / 2],
  ];
  return rows.map(([w, h, ix, iy], i) => ({
    w,
    h,
    ix,
    iy,
    big,
    edge: i < 4 ? null : ("tblr"[i - 4] as "t" | "b" | "l" | "r"),
  }));
}

export interface DropShadow {
  x: number;
  y: number;
  /** Standard deviation (a drop-shadow's blur). */
  sd: number;
  col: string;
  rgb: string;
  alpha: number;
}

const NUM = /^-?[\d.]+(px)?$/;

/** The `drop-shadow()` list -> [{ x, y, sd, colour }]. */
export function nvaParseShadow(
  filter: string | null | undefined
): DropShadow[] {
  const out: DropShadow[] = [];
  const re = /drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter || ""))) {
    const toks: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of m[1].trim() + " ") {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === " " && depth === 0) {
        if (cur) toks.push(cur);
        cur = "";
      } else cur += ch;
    }
    const lens = toks.filter((t) => NUM.test(t)).map(parseFloat);
    const col = toks.filter((t) => !NUM.test(t)).join(" ") || "rgba(0,0,0,.3)";
    // the colour's channels, for the edge gradients' stops
    const m4 = col.match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i
    );
    const hx = col.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    let rgb = "0,0,0";
    let alpha = 0.3;
    if (m4) {
      rgb = `${m4[1]},${m4[2]},${m4[3]}`;
      alpha =
        m4[4] == null
          ? 1
          : m4[4].endsWith("%")
            ? parseFloat(m4[4]) / 100
            : parseFloat(m4[4]);
    } else if (hx) {
      const n = parseInt(hx[1], 16);
      rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
      alpha = hx[2] ? parseInt(hx[2], 16) / 255 : 1;
    }
    out.push({
      x: lens[0] || 0,
      y: lens[1] || 0,
      sd: lens[2] || 0,
      col,
      rgb,
      alpha,
    });
  }
  return out;
}

export interface FlatShadow {
  x: number;
  y: number;
  sd: number;
  rgb: string;
  alpha: number;
  col: string;
}

/**
 * A filter list chains: each drop-shadow also shadows the shadows before it
 * (dark: the white rim lightens the big shadow). Expand that into the flat
 * list box-shadow paints, top first.
 */
export function nvaChainShadow(list: readonly DropShadow[]): FlatShadow[] {
  let shapes = [{ x: 0, y: 0, v: 0, a: 1 }];
  const out: FlatShadow[] = [];
  for (const d of list) {
    const copies = shapes.map((sh) => ({
      x: sh.x + d.x,
      y: sh.y + d.y,
      v: sh.v + d.sd * d.sd,
      a: sh.a * d.alpha,
      rgb: d.rgb,
    }));
    for (const c of copies)
      out.push({
        x: c.x,
        y: c.y,
        sd: Math.sqrt(c.v),
        rgb: c.rgb,
        alpha: c.a,
        col: `rgba(${c.rgb},${c.a.toFixed(4)})`,
      });
    shapes = shapes.concat(copies);
  }
  return out.filter((d) => d.alpha > 0.004);
}

export function nvaBoxShadow(list: readonly FlatShadow[]) {
  return (
    list
      .map((d) => `${d.x}px ${d.y}px ${(2 * d.sd).toFixed(2)}px ${d.col}`)
      .join(", ") || "none"
  );
}

/** Normal CDF (Abramowitz-Stegun erf). */
export function nvaPhi(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const e =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}

/**
 * The shadow outside one straight edge, as gradients (one layer per shadow,
 * stacked like box-shadow's): side t / b / l / r, from the edge outward.
 */
export function nvaShadowEdges(list: readonly FlatShadow[]) {
  const E = NVA_SH_E;
  const steps = 24;
  const out: Record<"t" | "b" | "l" | "r", string> = {
    t: "none",
    b: "none",
    l: "none",
    r: "none",
  };
  for (const side of ["t", "b", "l", "r"] as const) {
    const dir = { t: "to top", b: "to bottom", l: "to left", r: "to right" }[
      side
    ];
    out[side] =
      list
        .map((d) => {
          // the shadow's own edge sits off the shape's by the offset along this side's outward normal
          const off =
            side === "t"
              ? -d.y
              : side === "b"
                ? d.y
                : side === "l"
                  ? -d.x
                  : d.x;
          const stops: string[] = [];
          for (let i = 0; i <= steps; i++) {
            const dist = E * Math.pow(i / steps, 1.6);
            const a =
              d.sd > 0 ? nvaPhi((off - dist) / d.sd) : dist < off ? 1 : 0;
            stops.push(
              `rgba(${d.rgb},${(a * d.alpha).toFixed(4)}) ${dist.toFixed(2)}px`
            );
          }
          return `linear-gradient(${dir}, ${stops.join(", ")})`;
        })
        .join(", ") || "none";
  }
  return out;
}

export interface ShadowPiecePlace {
  transform: string;
  opacity: string;
  /** Edge pieces of zero length are hidden. */
  hidden: boolean;
}

export interface ShadowSetPlace {
  /** The set's weight (how near the shape's radius is to its own). */
  weight: number;
  hidden: boolean;
  pieces: ShadowPiecePlace[];
}

/** How much of set `i` shows at radius `r`: 1 at its own radius, 0 at its neighbours'. */
export function nvaSetWeight(i: number, r: number) {
  const rr = NVA_SH_R;
  const r0 = rr[i];
  const lo = rr[i - 1];
  const hi = rr[i + 1];
  if (r === r0) return 1;
  if (r < r0) return lo == null ? 1 : nvaUnit((r - lo) / (r0 - lo));
  return hi == null ? 1 : nvaUnit((hi - r) / (hi - r0));
}

/**
 * Lay the shadow sets on the shape `s` (menu coordinates): the two sets either
 * side of its radius, weighted by it; a set wider than the shape allows (a pill
 * shrinking to the handle) is scaled down whole, so its corners never overlap.
 * The weight goes on the pieces, not the set: an opacity changing on a parent
 * of layers makes Chromium repaint them every frame.
 */
export function nvaShadowPlacement(s: NvaBox): ShadowSetPlace[] {
  const E = NVA_SH_E;
  const U = NVA_SH_U;
  return NVA_SH_R.map((r0, i) => {
    const w = nvaSetWeight(i, s.r);
    if (w < 0.005) return { weight: w, hidden: true, pieces: [] };
    const k = Math.min(1, s.h / (2 * r0), s.w / (2 * r0));
    const Rk = r0 * k;
    const Ek = E * k;
    const ex = Math.max(s.w - 2 * Rk, 0);
    const ey = Math.max(s.h - 2 * Rk, 0);
    const at = (x: number, y: number, sx: number, sy: number) =>
      `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    const tr = [
      at(s.x - Ek, s.y - Ek, k, k),
      at(s.x + s.w - Rk, s.y - Ek, k, k),
      at(s.x - Ek, s.y + s.h - Rk, k, k),
      at(s.x + s.w - Rk, s.y + s.h - Rk, k, k),
      at(s.x + Rk, s.y - Ek, ex / U, k),
      at(s.x + Rk, s.y + s.h, ex / U, k),
      at(s.x - Ek, s.y + Rk, k, ey / U),
      at(s.x + s.w, s.y + Rk, k, ey / U),
    ];
    const opacity = w.toFixed(3);
    return {
      weight: w,
      hidden: false,
      pieces: tr.map((transform, n) => ({
        transform,
        opacity,
        hidden: n >= 4 && (n < 6 ? ex : ey) < 0.25,
      })),
    };
  });
}
