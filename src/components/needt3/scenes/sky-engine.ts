/**
 * THE PRINTED SKY - the renderer (prototype scenes.jsx `pxStart`).
 *
 * A calm, muted sky drawn on <canvas>: a greyed-lavender gradient, crisp
 * billowy cumulus (a density field at 1/4 resolution, edges resolved at 1/2
 * with a smoothstep and a fine detail octave, lit from above), cloud edges and
 * the left / right sides dissolving into a printed halftone dot screen drawn
 * in CSS pixels, and a static paper grain over everything (a CSS layer).
 * Clouds drift at a calm pace (W/110 px/s, 5-14) and breathe; near the
 * pointer they thin a little.
 *
 * One canvas pair per sky, one requestAnimationFrame per sky, no React state
 * per frame, no per-frame allocations (colours are packed into Int32 views).
 *
 * Pause rules (see ./sky-rest.ts, tested on their own):
 *   - no frames while the tab is hidden, the sky is off-screen, an opaque
 *     element covers it (5-point check, once a second) or it is parked;
 *   - the page idle for 12 s: the drift eases to 0 and the sky stops
 *     scheduling frames with its last frame painted; input wakes it smoothly;
 *   - prefers-reduced-motion: a single still frame, redrawn only when the
 *     words (data-px-calm) or the palette change;
 *   - pacing: full skies 20 fps, small ones 24, pointer in the sky 30 / display.
 *
 * Not ported: the prototype's debug hooks (window.__sky*, __pxBench,
 * __pxStats, __pxProf) and the promo-card "scene" kept only what the promo
 * card needs (it is used by the sidebar upgrade card).
 */
import { newDate } from "@/lib/date-utils";

import { NOISE_GRID, hash3, noise, noiseAxis } from "./sky-noise";
import {
  type Mood,
  type Palette,
  type Rgb,
  applyPaletteVars,
  lerp3,
  pack,
  paletteFor,
  readMoodTable,
  smooth,
} from "./sky-palette";
import {
  atRest,
  driftSpeed,
  easeDrift,
  framePeriod,
  joinRest,
  mayAnimate,
} from "./sky-rest";

export type SkyHorizon = "cloudsea" | "haze" | "none";
export type SkyClouds = "wispy" | "puff";

export interface SkyOptions {
  variant?: string;
  intensity?: number;
  interactive?: boolean;
  horizon?: SkyHorizon;
  clouds?: SkyClouds;
  scene?: "promo";
  fps?: number;
  mood?: string;
  dark?: boolean;
  parked?: boolean;
}

export interface SkyEngine {
  set(mood?: string, dark?: boolean): void;
  park(v: boolean): void;
  stop(): void;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  h: number;
  p: number[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  sp: number;
  depth: number;
  a: number;
  lb: number;
}

interface Mouse {
  x: number;
  y: number;
  tx: number;
  ty: number;
  amp: number;
  on: number;
  cx: number;
  cy: number;
  fresh: boolean;
  snap: boolean;
  touch: boolean;
}

/* Halftone dot stamps: NL sizes, antialiased by 4x4 supersampling. Each
   stamp is [dx, dy, coverage, ...]. Dot area grows with the weight. */
const PITCH = 4;
const NL = 12;
const STAMPS: number[][] = (function () {
  const out: number[][] = [];
  const rmax = PITCH * 0.47;
  const c = PITCH / 2;
  for (let l = 0; l < NL; l++) {
    const r = Math.max(0.42, rmax * Math.sqrt((l + 1) / NL));
    const st: number[] = [];
    for (let y = 0; y < PITCH; y++)
      for (let x = 0; x < PITCH; x++) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const dx = x + (sx + 0.5) / 4 - c;
            const dy = y + (sy + 0.5) / 4 - c;
            if (dx * dx + dy * dy <= r * r) n++;
          }
        if (n) st.push(x, y, n / 16);
      }
    out.push(st);
  }
  return out;
})();

/* Cloud-sea banks, far to near: [base (0-1 of height), vertical squash of the
   round puffs, puff period px, drift as a share of the main clouds' speed
   (parallax), haze toward the horizon]. */
const SEA: number[][] = [
  [0.79, 0.32, 70, 0.12, 0.5],
  [0.83, 0.36, 110, 0.2, 0.34],
  [0.88, 0.42, 170, 0.31, 0.2],
  [0.94, 0.48, 250, 0.46, 0.09],
  [1.02, 0.55, 360, 0.66, 0],
];
const NS = SEA.length;
const MORPH = 2.2;
/* Promo cards: a composed little sky: [x (0-1 of width), base y (0-1 of
   height), width (x height), depth 0 far ... 1 near]. */
const PROMO: number[][] = [
  [0.57, 0.44, 0.56, 0],
  [0.8, 0.32, 0.46, 0.15],
  [0.94, 0.64, 0.52, 0.35],
  [0.7, 0.84, 0.8, 0.55],
  [0.95, 1.14, 1.35, 1],
];
const PROMO_SEL =
  "[data-px-promo],[data-pw-promo],[data-settings-plan],[data-mb-promo]";
/* Second cloud bank: noise-space offset (x, y) and a small bias. */
const BANK2 = [37.3, 21.9, 0.02];
const SEEDS: Record<string, number[]> = {
  a: [3.1, 7.7, 1],
  b: [41.3, 12.9, -1],
  c: [19.5, 88.2, 1],
  d: [63.7, 31.4, -1],
};

/** The main clouds travel W/110 px/s, clamped to 5-14. */
export const driftPxPerSecond = (W: number) =>
  Math.max(5, Math.min(14, W / 110));

function horizonOf(opt: SkyOptions): SkyHorizon {
  return opt.horizon ?? "cloudsea";
}

export function startSky(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  dotCanvas: HTMLCanvasElement,
  opt: SkyOptions
): SkyEngine {
  const ctx = canvas.getContext("2d", { alpha: false });
  const dctx = dotCanvas.getContext("2d");
  const scope = (root.closest("[data-px-scope]") as HTMLElement | null) ?? root;
  if (!ctx || !dctx) {
    return { set() {}, park() {}, stop() {} };
  }
  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let reduced = !!(mq && mq.matches);

  let img: ImageData = ctx.createImageData(1, 1);
  let W = 0;
  let H = 0;
  let kc = 4;
  let cols = 0;
  let rows = 0;
  let gc = 0;
  let gr = 0;
  let table: Record<string, Mood> | null = null;
  let pal: Palette | null = null;
  let palSig = "";
  let lastPal = 0;
  let base: Float32Array | null = null;
  let calmMap: Float32Array | null = null;
  let calmTgt: Float32Array | null = null;
  let ridgeTop: Float32Array | null = null;
  let stars: number[] = [];
  let DW = new Float32Array(0);
  let DL = new Float32Array(0);
  let FB = new Float32Array(0);
  let FA = new Float32Array(0);
  let FL = new Float32Array(0);
  let F = new Float32Array(0);
  let LB = new Float32Array(0);
  let FW = new Float32Array(0);
  let MB = new Float32Array(0);
  let PL = new Float32Array(0);
  let od = new Float32Array(0);
  let seaTopBuf = new Float32Array(0);
  let seaEdge: Float32Array[] = [];
  let seaE = new Float32Array(0);
  let clouds: Cloud[] | null = null;
  let cloudPad = 0;
  let AL = new Float32Array(0);
  let base32 = new Int32Array(0);
  let seaFw = new Float32Array(0);
  let dimg: ImageData = dctx.createImageData(1, 1);
  let d32: Int32Array = new Int32Array(0);
  let dW = 0;
  let dH = 0;
  let ncx = 0;
  let ncy = 0;
  let side: Float32Array | null = null;
  /* Perf: a low-frequency lattice (every LQ coarse cells) for the smooth noise
     terms, interpolated per cell; per-bank puff caches for the cloud sea;
     reusable buffers so a frame allocates nothing. */
  let LQ = 2;
  let lc = 0;
  let lr = 0;
  let LW = new Float32Array(0);
  let L1 = new Float32Array(0);
  let L2 = new Float32Array(0);
  let LP = new Float32Array(0);
  let rwW = new Float32Array(0);
  let rw1 = new Float32Array(0);
  let rw2 = new Float32Array(0);
  let rwP = new Float32Array(0);
  let lxi = new Int32Array(0);
  let ltx = new Float32Array(0);
  let seaCx = new Float32Array(0);
  let seaRr = new Float32Array(0);
  let seaCx2 = new Float32Array(0);
  let seaRr2 = new Float32Array(0);
  let D32: Int32Array = new Int32Array(0);
  const aLut = new Int32Array(33);
  let aLutSig = "";
  let cellKey = new Int32Array(0);
  let stampOff: Int32Array[] = [];
  let stampV: Int32Array[][] = [];
  let stampW = 0;
  let dotsReset = true;
  let dX0 = 0;
  let dY0 = 0;
  let dX1 = 0;
  let dY1 = 0;
  let nXi = new Int32Array(0);
  let nXu = new Float32Array(0);
  let nXi2 = new Int32Array(0);
  let nXu2 = new Float32Array(0);
  let nYi = new Int32Array(0);
  let nYv = new Float32Array(0);
  let nYi2 = new Int32Array(0);
  let nYv2 = new Float32Array(0);
  let cloudList = new Int32Array(0);
  let cloudN = 0;
  let starV = new Int32Array(0);
  const cloudLut = new Int32Array(256);
  let cloudLutSig = "";
  const seaInvBuf = new Float32Array(NS);
  const seaLut = new Int32Array(NS * 128);
  let seaLutSig = "";
  let frameTick = 0;
  let fieldOk = false;
  let fieldSx = 0;
  let fieldS = 0;
  let xg = new Int32Array(0);
  let xt = new Float32Array(0);
  let qA = new Int32Array(0);
  let qB = new Int32Array(0);
  let big = false;
  let calmLive = true;
  let covered = false;
  let parked = !!opt.parked;
  const seed = SEEDS[opt.variant ?? "a"] ?? SEEDS.a;
  const intensity =
    opt.intensity == null ? 1 : Math.max(0.6, Math.min(1.8, opt.intensity));
  const own = horizonOf(opt);
  let hz: SkyHorizon = own;
  const ownClouds: SkyClouds = opt.clouds === "puff" ? "puff" : "wispy";
  let cm: SkyClouds = ownClouds;
  let calm: number[][] = [];
  const mouse: Mouse = {
    x: -1e4,
    y: -1e4,
    tx: -1e4,
    ty: -1e4,
    amp: 0,
    on: 0,
    cx: 0,
    cy: 0,
    fresh: false,
    snap: false,
    touch: false,
  };
  let hidden = document.hidden;
  let inView = true;
  let raf = 0;
  let last = 0;
  let stopped = false;
  const t0 = performance.now() - ((seed[0] * 1000) % 20000);
  const little = () => H < 220 || W < 420;
  /* Promo cards: explicit opt.scene, or a sky inside a known promo host. */
  const promoHost: HTMLElement | null =
    opt.scene === "promo"
      ? ((root.closest(PROMO_SEL) as HTMLElement | null) ?? root)
      : (root.closest(PROMO_SEL) as HTMLElement | null);
  const promo = !!promoHost;
  let pos = 0;
  let lastT = -1;
  let hov = 0;
  let hovOn = 0;

  /* Rest: `fl` ramps 0..1 (down over 1.5 s when the page is idle, up over 0.8 s
     on input); the drift and the animation clock `ta` advance at
     smoothstep(fl) x real time, so stopping and resuming never jump. */
  const joined = joinRest((idle) => {
    if (!idle) kick();
  });
  const pageRest = joined.rest;
  let fl = pageRest.idle ? 0 : 1;
  let ta = 0;

  function resize() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    /* Finer on small skies, a touch coarser on very large ones (the cloud
       edges dissolve into CSS-pixel dots anyway). */
    kc = H < 220 ? 3 : W * H > 1.1e6 ? 5 : 4;
    const kf = kc / 2;
    cols = Math.max(2, Math.ceil(W / kf));
    rows = Math.max(2, Math.ceil(H / kf));
    canvas.width = cols;
    canvas.height = rows;
    img = ctx!.createImageData(cols, rows);
    gc = Math.ceil(cols / 2) + 2;
    gr = Math.ceil(rows / 2) + 2;
    const n = gc * gr;
    F = new Float32Array(n);
    LB = new Float32Array(n);
    FW = new Float32Array(n);
    MB = new Float32Array(n);
    PL = new Float32Array(n);
    AL = new Float32Array(n).fill(1);
    DW = new Float32Array(n);
    DL = new Float32Array(n);
    FB = new Float32Array(n);
    FA = new Float32Array(n);
    FL = new Float32Array(n);
    clouds = null;
    od = new Float32Array(gc);
    seaTopBuf = new Float32Array(cols);
    seaE = new Float32Array(NS * cols);
    seaEdge = SEA.map((_q, li) => seaE.subarray(li * cols, (li + 1) * cols));
    dW = Math.max(1, Math.ceil(W));
    dH = Math.max(1, Math.ceil(H));
    dotCanvas.width = dW;
    dotCanvas.height = dH;
    dimg = dctx!.createImageData(dW, dH);
    d32 = new Int32Array(dimg.data.buffer);
    ncx = Math.floor(dW / PITCH);
    ncy = Math.floor(dH / PITCH);
    cellKey = new Int32Array(0);
    seaFw = new Float32Array(NS * ncx);
    base = null;
    calmMap = null;
    calmTgt = null;
    side = null;
    D32 = new Int32Array(img.data.buffer, img.data.byteOffset, cols * rows);
    /* Full skies (> ~500k px) run at 20 fps, small ones at 24; the smooth
       noise lattice is 4 cells apart on full skies, 2 on small ones. */
    big = W * H > 5e5;
    LQ = big ? 4 : 2;
    lc = Math.floor((gc - 1) / LQ) + 2;
    lr = Math.floor((gr - 1) / LQ) + 2;
    LW = new Float32Array(lc * lr);
    L1 = new Float32Array(lc * lr);
    L2 = new Float32Array(lc * lr);
    LP = new Float32Array(lc * lr);
    rwW = new Float32Array(lc);
    rw1 = new Float32Array(lc);
    rw2 = new Float32Array(lc);
    rwP = new Float32Array(lc);
    lxi = new Int32Array(gc);
    ltx = new Float32Array(gc);
    for (let gx = 0; gx < gc; gx++) {
      lxi[gx] = (gx / LQ) | 0;
      ltx[gx] = (gx - lxi[gx] * LQ) / LQ;
    }
    const nP = Math.ceil(W / 12) + 16;
    seaCx = new Float32Array(nP);
    seaRr = new Float32Array(nP);
    seaCx2 = new Float32Array(nP * 3);
    seaRr2 = new Float32Array(nP * 3);
    fieldOk = false;
    nXi = new Int32Array(cols);
    nXu = new Float32Array(cols);
    nXi2 = new Int32Array(cols);
    nXu2 = new Float32Array(cols);
    nYi = new Int32Array(rows);
    nYv = new Float32Array(rows);
    nYi2 = new Int32Array(rows);
    nYv2 = new Float32Array(rows);
    cloudList = new Int32Array(cols * rows);
    cloudN = 0;
    xg = new Int32Array(cols);
    xt = new Float32Array(cols);
    qA = new Int32Array(gc);
    qB = new Int32Array(gc);
  }

  /* Elements marked data-px-calm push clouds away behind them. */
  function readCalm(): boolean {
    const r0 = root.getBoundingClientRect();
    calm = [];
    scope.querySelectorAll("[data-px-calm]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height)
        calm.push([
          (r.left - r0.left) / kc,
          (r.top - r0.top) / kc,
          (r.right - r0.left) / kc,
          (r.bottom - r0.top) / kc,
        ]);
    });
    /* Unchanged words: keep the calm target as it is. */
    const sa = calm
      .map((q) => q.map((v) => Math.round(v * 4)).join(","))
      .join(";");
    if (sa === calmAllSig && calmTgt && calmTgt.length === gc * gr)
      return false;
    calmAllSig = sa;
    buildCalm();
    return true;
  }
  /* Calm is eased: buildCalm writes the TARGET; draw() eases calmMap toward
     it, so clouds thin out and fill back in over ~0.6 s, not in one frame. */
  function buildCalm() {
    if (!gc) return;
    const fresh = !calmMap || calmMap.length !== gc * gr;
    if (!calmTgt || calmTgt.length !== gc * gr)
      calmTgt = new Float32Array(gc * gr);
    else calmTgt.fill(0);
    if (fresh) calmMap = new Float32Array(gc * gr);
    buildCalmInto(calmTgt);
    if ((fresh || reduced) && calmMap) calmMap.set(calmTgt);
    calmLive = true;
  }
  function easeCalm(ke: number) {
    if (!calmLive || !calmMap || !calmTgt || calmMap.length !== calmTgt.length)
      return;
    const k = reduced ? 1 : ke;
    let moving = false;
    for (let i = 0; i < calmMap.length; i++) {
      const dv = calmTgt[i] - calmMap[i];
      if (dv) {
        moving = true;
        calmMap[i] = Math.abs(dv) < 0.002 ? calmTgt[i] : calmMap[i] + dv * k;
      }
    }
    calmLive = moving; /* settled: skip until the next readCalm */
  }
  function buildCalmInto(map: Float32Array) {
    if (!calm.length) return;
    const CP = 64 / kc;
    for (let c = 0; c < calm.length; c++) {
      const q = calm[c];
      const x0 = Math.max(0, Math.floor(q[0] - CP));
      const x1 = Math.min(gc - 1, Math.ceil(q[2] + CP));
      const y0 = Math.max(0, Math.floor(q[1] - CP));
      const y1 = Math.min(gr - 1, Math.ceil(q[3] + CP));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const ex = x < q[0] ? q[0] - x : x > q[2] ? x - q[2] : 0;
          const ey = y < q[1] ? q[1] - y : y > q[3] ? y - q[3] : 0;
          const dd = Math.sqrt(ex * ex + ey * ey);
          if (dd < CP) {
            const kk = 1 - dd / CP;
            const v = kk * kk * (3 - 2 * kk);
            const o = y * gc + x;
            if (v > map[o]) map[o] = v;
          }
        }
    }
  }

  function readPalette(force: boolean): boolean {
    if (!table) table = readMoodTable(root);
    const dark =
      opt.dark != null ? !!opt.dark : !!root.closest('[data-theme="dark"]');
    const p = paletteFor(table, dark, opt.mood, newDate());
    const h: SkyHorizon = promo || own === "none" ? "none" : own;
    const c: SkyClouds = promo ? "wispy" : ownClouds;
    const sig = p.name + (dark ? "d" : "") + h + c;
    if (sig === palSig && !force) {
      pend = null;
      return false;
    }
    if (force || !pal || !base) {
      applyPal(p, h, c, sig);
      base = null;
      pend = null;
      return true;
    }
    /* A new mood / theme mid-run: swap palette and base sky together, when idle. */
    pend = [p, h, c, sig];
    schedule();
    return false;
  }
  function applyPal(p: Palette, h: SkyHorizon, c: SkyClouds, sig: string) {
    palSig = sig;
    pal = p;
    hz = h;
    cm = c;
    fieldOk = false;
    applyPaletteVars(scope, p);
    if (scope !== root) applyPaletteVars(root, p);
    clouds = null;
  }

  /* Rebuilds (resize, new mood) run once, coalesced, in idle time. */
  let idleId = 0;
  let needResize = false;
  let baseStale = false;
  let pend: [Palette, SkyHorizon, SkyClouds, string] | null = null;
  let calmAllSig = "";
  const ric = (f: () => void, t?: number): number =>
    window.requestIdleCallback
      ? window.requestIdleCallback(f, { timeout: t ?? 150 })
      : window.setTimeout(f, Math.min(30, t ?? 30));
  const cic = (id: number) =>
    window.cancelIdleCallback
      ? window.cancelIdleCallback(id)
      : window.clearTimeout(id);
  function schedule() {
    if (!idleId && !stopped) idleId = ric(runIdle);
  }
  function runIdle() {
    idleId = 0;
    if (stopped) return;
    let sized = false;
    if (needResize) {
      needResize = false;
      const r = root.getBoundingClientRect();
      if (Math.max(1, r.width) !== W || Math.max(1, r.height) !== H) {
        resize();
        calmAllSig = "";
        readCalm();
        sized = true;
      }
    }
    if (pend) {
      applyPal(pend[0], pend[1], pend[2], pend[3]);
      pend = null;
      baseStale = true;
    }
    if (baseStale && base) {
      baseStale = false;
      buildBase();
    }
    if (sized || reduced || !raf) draw(performance.now(), true);
  }

  /* The static sky: gradient, sun glow, horizon (haze + ridges), stars. */
  function buildBase() {
    const P = pal;
    if (!P) return;
    const kf = kc / 2;
    const b = new Float32Array(cols * rows * 3);
    base = b;
    ridgeTop = null;
    const hor = hz === "cloudsea" ? 0.8 : hz === "haze" ? 0.86 : 1;
    const low = hz === "none" ? lerp3(P.mid, P.low, 0.55) : P.low;
    const mist = P.night
      ? lerp3(P.low, P.lit, 0.18)
      : lerp3(P.low, [255, 255, 255], 0.6);
    const sx = (promo ? 0.94 : P.sunX) * cols;
    const sy = (promo ? 0.02 : P.sunY) * rows;
    const sr = Math.max(cols, rows) * (promo ? 0.42 : 0.45);
    const sunA = promo ? Math.max(0.5, P.sunA * 1.4) : P.sunA;
    /* The glow's Gaussians are separable: exp(-k(dx2+dy2)) = exp(-k dx2)*exp(-k dy2). */
    const gx3 = new Float64Array(cols);
    const gx26 = new Float64Array(cols);
    for (let x = 0; x < cols; x++) {
      const dx = (x - sx) / sr;
      gx3[x] = Math.exp(-dx * dx * 3);
      gx26[x] = Math.exp(-dx * dx * 26);
    }
    for (let y = 0; y < rows; y++) {
      const yn = y / rows;
      const yh = yn / hor;
      let c =
        yh < 1
          ? lerp3(P.top, P.mid, smooth(yh / 0.6) * 0.85 + (yh / 0.6) * 0.15)
          : low;
      if (yh < 1 && yh >= 0.6) c = lerp3(P.mid, low, smooth((yh - 0.6) / 0.4));
      if (yh < 0.6) c = lerp3(P.top, P.mid, smooth(yh / 0.6));
      if (hz === "haze" && yn > 0.7)
        c = lerp3(c, mist, smooth((yn - 0.7) / 0.3) * 0.85);
      const dy = (y - sy) / sr;
      const gy3 = Math.exp(-dy * dy * 3) * 0.8;
      const gy26 = Math.exp(-dy * dy * 26) * 0.4;
      for (let x = 0; x < cols; x++) {
        const g = Math.min(1, sunA * (gx3[x] * gy3 + gx26[x] * gy26));
        const o = (y * cols + x) * 3;
        b[o] = c[0] + (P.sun[0] - c[0]) * g;
        b[o + 1] = c[1] + (P.sun[1] - c[1]) * g;
        b[o + 2] = c[2] + (P.sun[2] - c[2]) * g;
      }
    }
    if (hz === "haze") {
      /* Three distant ridges, far to near, each a touch deeper; mist pools at their feet. */
      const rt = new Float32Array(cols).fill(rows);
      ridgeTop = rt;
      const Ls = [
        [0.79, 0.05, 0.3, 11],
        [0.85, 0.045, 0.42, 23],
        [0.91, 0.04, 0.56, 37],
      ];
      for (let li = 0; li < Ls.length; li++) {
        const [b0, amp, strength, sd] = Ls[li];
        const rc = lerp3(mist, P.ridge, strength * (P.night ? 1.6 : 1));
        for (let x = 0; x < cols; x++) {
          const u = (x * kf) / Math.max(300, W * 0.55);
          const n =
            noise(u * 2.2 + sd + seed[1], 1.7) * 0.7 +
            noise(u * 6.1 + sd * 2, 4.1) * 0.3;
          const hy = rows * (b0 - amp * (n * 1.6 - 0.3));
          if (hy < rt[x]) rt[x] = hy;
          for (let y = Math.max(0, Math.floor(hy)); y < rows; y++) {
            const a = Math.min(1, y - hy + 0.5);
            if (a <= 0) continue;
            const fog = smooth((y - hy) / (rows * 0.07));
            const cc = lerp3(rc, mist, fog * 0.55);
            const o = (y * cols + x) * 3;
            b[o] += (cc[0] - b[o]) * a;
            b[o + 1] += (cc[1] - b[o + 1]) * a;
            b[o + 2] += (cc[2] - b[o + 2]) * a;
          }
        }
      }
    }
    dotsReset = true; /* colours changed: restamp every dot cell */
    /* Packed copy for the fast clear-sky path of the fine pass. */
    base32 = new Int32Array(cols * rows);
    for (let i = 0, o = 0; i < base32.length; i++, o += 3) {
      const rr = b[o] < 0 ? 0 : b[o] > 255 ? 255 : b[o] + 0.5;
      const gg = b[o + 1] < 0 ? 0 : b[o + 1] > 255 ? 255 : b[o + 1] + 0.5;
      const bb = b[o + 2] < 0 ? 0 : b[o + 2] > 255 ? 255 : b[o + 2] + 0.5;
      base32[i] =
        (255 << 24) | ((bb & 255) << 16) | ((gg & 255) << 8) | (rr & 255);
    }
    stars = [];
    fieldOk = false; /* repaint everything on the next frame */
    if (P.night) {
      const n = Math.round((cols * rows) / 3200); /* all in the top 55% */
      for (let i = 0; i < n; i++) {
        const x = Math.floor(hash3(i, seed[0], 1) * cols);
        const y = Math.floor(Math.pow(hash3(i, seed[1], 2), 1.5) * rows * 0.55);
        stars.push(
          x,
          y,
          0.25 + hash3(i, 3, 3) * 0.45,
          hash3(i, 4, 4) * 6.28,
          0.4 + hash3(i, 5, 5) * 1.2
        );
      }
    }
    starV = new Int32Array(stars.length / 5);
  }

  /* A cumulus: a dome of puffs on a flat base; deterministic per variant. */
  function makeCloud(
    i: number,
    w: number,
    h: number,
    x: number,
    y: number,
    sp: number,
    depth: number
  ): Cloud {
    const p: number[] = [];
    const np =
      (promo ? 12 : 9) + Math.floor(hash3(i + seed[0] * 3, 4, seed[1]) * 6);
    for (let j = 0; j < np; j++) {
      const u = (j + 0.5) / np + (hash3(i, j, 5) - 0.5) * 0.12;
      const dome = Math.pow(
        Math.sin(Math.min(1, Math.max(0, u)) * Math.PI),
        0.8
      );
      const pr = w * (0.1 + 0.13 * dome * (0.5 + 0.7 * hash3(i, j, 6)));
      p.push(
        (u - 0.5) * w * 0.8,
        -pr * 0.45 - dome * h * 0.42 * (0.5 + 0.5 * hash3(i, j, 7)),
        pr,
        hash3(i, j, 8) * 6.28
      );
    }
    for (let j = 0, nt = promo ? 7 : 4; j < nt; j++) {
      /* a few small top puffs */
      const u = 0.3 + 0.4 * hash3(i, j, 9);
      const pr = w * (0.09 + 0.05 * hash3(i, j, 10));
      p.push(
        (u - 0.5) * w * 0.7,
        -h * (0.5 + 0.12 * hash3(i, j, 11)),
        pr,
        hash3(i, j, 12) * 6.28
      );
    }
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    let y1 = 0;
    for (let j = 0; j < p.length; j += 4) {
      const rr = p[j + 2] * 1.1;
      x0 = Math.min(x0, p[j] - rr);
      x1 = Math.max(x1, p[j] + rr);
      y0 = Math.min(y0, p[j + 1] - rr);
      y1 = Math.max(y1, p[j + 1] + rr);
    }
    cloudPad = Math.max(cloudPad, Math.max(-x0, x1) + 20);
    /* depth: 0 far (hazy, see-through, slow) ... 1 near (bright, opaque, fast). */
    return {
      x,
      y,
      w,
      h,
      p,
      x0,
      x1,
      y0,
      y1,
      sp,
      depth,
      a: 0.5 + 0.5 * depth,
      lb: -0.06 + 0.14 * depth,
    };
  }
  function buildClouds() {
    const list: Cloud[] = [];
    clouds = list;
    cloudPad = 0;
    if (promo) {
      for (let i = 0; i < PROMO.length; i++) {
        const q = PROMO[i];
        const w = q[2] * H;
        const h = w * (0.46 + 0.1 * hash3(i, 2, seed[1]));
        list.push(
          makeCloud(i, w, h, q[0] * W, q[1] * H, 0.4 + 0.6 * q[3], q[3])
        );
      }
      list.forEach((c) => {
        c.x += cloudPad;
      });
      return;
    }
    const sc = Math.max(0.32, Math.min(1.15, H / 760));
    const top = hz === "none" ? 0.95 : hz === "haze" ? 0.66 : 0.62;
    const n = Math.max(2, Math.min(7, Math.round(W / (little() ? 170 : 300))));
    for (let i = 0; i < n; i++) {
      const r = (k: number) => hash3(i + seed[0] * 3, k, seed[1]);
      const w = (190 + 260 * r(1)) * sc;
      const h = w * (0.42 + 0.14 * r(2));
      const y =
        H * (0.14 + (top - 0.22) * ((i * 0.618 + r(3) * 0.35) % 1)) + h * 0.5;
      const c = makeCloud(i, w, h, 0, y, 0.75 + 0.5 * r(14), 1);
      c.a = 1;
      c.lb = 0;
      list.push(c);
    }
    list.forEach((c, i) => {
      c.x =
        ((i + 0.5 + (hash3(i + seed[0] * 3, 13, seed[1]) - 0.5) * 0.6) / n) *
        (W + c.w);
    });
  }
  /* Static dot screen on the left / right sides, patchy like distant cloud. */
  function buildSide() {
    const s = new Float32Array(ncx * ncy);
    side = s;
    const span = Math.max(120, W * 0.2);
    const k = little() ? 0.35 : 1;
    for (let cy = 0; cy < ncy; cy++)
      for (let cx = 0; cx < ncx; cx++) {
        const px = cx * PITCH + 2;
        const py = cy * PITCH + 2;
        const e = Math.min(px, W - px) / span;
        if (e >= 1) continue;
        const ramp = (1 - e) * (1 - e);
        const patch = smooth(
          (noise(px / 130 + seed[0], py / 130 + seed[1]) * 0.75 +
            noise(px / 40 + 9, py / 40 + 3) * 0.25 -
            0.42) /
            0.35
        );
        s[cy * ncx + cx] = ramp * patch * 0.5 * k;
      }
  }

  /* Metaball clouds into MB (density), PL (top light), and for promo depth:
     back layer DW/AL/DL (weighted opacity / light bias), front layer FB/FA/FL. */
  function accumClouds(tm: number, dir: number, t: number) {
    if (!clouds) buildClouds();
    const list = clouds ?? [];
    MB.fill(0);
    PL.fill(0);
    AL.fill(0);
    DW.fill(0);
    DL.fill(0);
    FB.fill(0);
    FA.fill(0);
    FL.fill(0);
    const span = W + cloudPad * 2;
    for (let ci = 0; ci < list.length; ci++) {
      const c = list[ci];
      let ox = promo
        ? c.x -
          cloudPad +
          dir *
            W *
            (0.06 + 0.05 * c.depth) *
            Math.sin((t * 6.283) / (60 - 20 * c.depth) + ci * 1.9)
        : ((((c.x + dir * pos * c.sp) % span) + span) % span) - cloudPad;
      /* Promo hover: the clouds make way, nearer ones further. */
      const lift = promo ? hov * (2 + 4 * c.depth) : 0;
      if (promo && hov > 0.001) ox += hov * (6 + 14 * c.depth);
      const cy0 = c.y - lift;
      const wDepth = 1 + 5 * c.depth;
      const front = promo && c.depth >= 0.5;
      const bx0 = Math.max(0, Math.floor((ox + c.x0) / kc));
      const bx1 = Math.min(gc - 1, Math.ceil((ox + c.x1) / kc));
      const by0 = Math.max(0, Math.floor((cy0 + c.y0) / kc));
      const by1 = Math.min(gr - 1, Math.ceil((cy0 + c.y1) / kc));
      if (bx0 > bx1 || by0 > by1) continue;
      const floorY = cy0 - c.h * (promo ? 0.12 : 0.05);
      const floorH = c.h * (promo ? 0.42 : 0.22);
      for (let pi = 0; pi < c.p.length; pi += 4) {
        /* Breathing: each puff swells and settles on its own slow phase. */
        const pr =
          c.p[pi + 2] *
          (1 +
            0.07 * Math.sin(tm * 0.11 + c.p[pi + 3]) +
            0.03 * Math.sin(tm * 0.047 + c.p[pi + 3] * 2.3));
        const pr2 = pr * pr;
        const pcx = ox + c.p[pi];
        const pcy = cy0 + c.p[pi + 1];
        const x0 = Math.max(bx0, Math.floor((pcx - pr) / kc));
        const x1 = Math.min(bx1, Math.ceil((pcx + pr) / kc));
        const y0 = Math.max(by0, Math.floor((pcy - pr) / kc));
        const y1 = Math.min(by1, Math.ceil((pcy + pr) / kc));
        for (let gy = y0; gy <= y1; gy++) {
          const dy = gy * kc - pcy;
          const dy2 = dy * dy;
          const row = gy * gc;
          const keep =
            1 - 0.92 * smooth((gy * kc - floorY) / floorH); /* flat base */
          if (keep <= 0.08) continue;
          for (let gx = x0; gx <= x1; gx++) {
            const dx = gx * kc - pcx;
            const q = (dx * dx + dy2) / pr2;
            if (q < 1) {
              const v = 1 - q;
              const vv = v * v * keep;
              const o = row + gx;
              MB[o] += vv;
              PL[o] -= (vv * dy) / pr;
              if (front) {
                FB[o] += vv;
                FA[o] += vv * c.a;
                FL[o] += vv * c.lb;
              } else {
                const wv = vv * wDepth;
                DW[o] += wv;
                AL[o] += wv * c.a;
                DL[o] += wv * c.lb;
              }
            }
          }
        }
      }
    }
  }
  /* Promo depth at cell o: sets AL[o], returns the light bias. */
  function depthAt(o: number): number {
    const dwv = DW[o];
    const fb = FB[o];
    let lbias = dwv > 0 ? DL[o] / dwv : 0;
    let al = dwv > 0 ? AL[o] / dwv : 1;
    if (fb > 0.001) {
      const fa = FA[o] / fb;
      const fl = FL[o] / fb;
      const k = dwv > 0 ? smooth((fb - 0.36) / 0.1) : 1;
      lbias = lbias + (fl - lbias) * k;
      al = al + (fa - al) * k;
      if (dwv > 0 && k < 1)
        lbias -= 0.16 * smooth((fb - 0.12) / 0.22) * (1 - k);
    }
    AL[o] = al;
    return lbias;
  }

  /* One fine pixel that a cloud or the cloud sea can reach (anything else is
     the static base sky). A stable function reading this frame's values from
     the f* variables, so it stays optimised across frames. */
  let fSea: Float32Array | null = null;
  let fFast = false;
  let fThIn = 0;
  let fSh: Rgb = [0, 0, 0];
  let fLit: Rgb = [0, 0, 0];
  let fLo: Rgb = [0, 0, 0];
  let fT = 0;
  let fE = 0;
  function px(x: number, y: number): number {
    const b = base as Float32Array;
    const o = y * cols + x;
    const gy0 = y >> 1;
    const ty = (y & 1) * 0.5;
    const gx0 = xg[x];
    const i00 = gy0 * gc + gx0;
    const i10 = i00 + 1;
    const i01 = i00 + gc;
    const i11 = i01 + 1;
    const st = fSea ? fSea[x] : 1e9;
    if (fFast && y <= st) {
      /* Deep inside a cloud (opaque, full sky): the edge terms are all 1,
         the colour depends on the light alone. */
      const tx = xt[x];
      const fa = F[i00] + (F[i10] - F[i00]) * tx;
      const fb = F[i01] + (F[i11] - F[i01]) * tx;
      const f = fa + (fb - fa) * ty;
      if (f > fThIn) {
        const la = LB[i00] + (LB[i10] - LB[i00]) * tx;
        const lb = LB[i01] + (LB[i11] - LB[i01]) * tx;
        return cloudLut[((la + (lb - la) * ty) * 255 + 0.5) | 0];
      }
    }
    const o3 = o * 3;
    let r = b[o3];
    let g = b[o3 + 1];
    let bl = b[o3 + 2];
    if (fSea && y >= fSea[x] + 1.5) {
      /* Nearest bank whose top is above this pixel. */
      let li = NS - 1;
      while (li > 0 && y < seaE[li * cols + x]) li--;
      const Ly = SEA[li];
      const dy = (y - seaE[li * cols + x]) * seaInvBuf[li];
      const L = dy >= 1 ? 0.5 : dy <= 0 ? 1 : 1 - dy * dy * (3 - 2 * dy) * 0.5;
      let cr = fSh[0] + (fLit[0] - fSh[0]) * L;
      let cg = fSh[1] + (fLit[1] - fSh[1]) * L;
      let cb = fSh[2] + (fLit[2] - fSh[2]) * L;
      const hv = Ly[4];
      cr += (fLo[0] - cr) * hv;
      cg += (fLo[1] - cg) * hv;
      cb += (fLo[2] - cb) * hv;
      /* 1px antialias against the bank behind (or the sky). */
      const ea = y - seaE[li * cols + x];
      if (ea < 1) {
        const k = ea < 0 ? 0 : ea;
        let br = r;
        let bg = g;
        let bb = bl;
        if (li > 0 && y >= seaE[(li - 1) * cols + x]) {
          const P2 = SEA[li - 1];
          const d2 = (y - seaE[(li - 1) * cols + x]) * seaInvBuf[li - 1];
          const L2v = 1 - smooth(d2) * 0.5;
          br = fSh[0] + (fLit[0] - fSh[0]) * L2v;
          bg = fSh[1] + (fLit[1] - fSh[1]) * L2v;
          bb = fSh[2] + (fLit[2] - fSh[2]) * L2v;
          br += (fLo[0] - br) * P2[4];
          bg += (fLo[1] - bg) * P2[4];
          bb += (fLo[2] - bb) * P2[4];
        }
        cr = br + (cr - br) * k;
        cg = bg + (cg - bg) * k;
        cb = bb + (cb - bb) * k;
      }
      return pack(cr, cg, cb);
    }
    const tx = xt[x];
    const fa = F[i00] + (F[i10] - F[i00]) * tx;
    const fb = F[i01] + (F[i11] - F[i01]) * tx;
    let f = fa + (fb - fa) * ty;
    if (f > fT - 0.03) {
      if (f < fT + 0.05) {
        /* Edge detail: two value-noise octaves, their lattice cells and
           smoothstep weights tabulated per column / row this frame. */
        const G = NOISE_GRID;
        let i = nXi[x] + nYi[y];
        let u = nXu[x];
        let v = nYv[y];
        let a = G[i];
        let bb2 = G[i + 257];
        let c = G[i + 1];
        let d = G[i + 258];
        const n1 = a + (bb2 - a) * u + (c - a) * v + (a - bb2 - c + d) * u * v;
        i = nXi2[x] + nYi2[y];
        u = nXu2[x];
        v = nYv2[y];
        a = G[i];
        bb2 = G[i + 257];
        c = G[i + 1];
        d = G[i + 258];
        const n2 = a + (bb2 - a) * u + (c - a) * v + (a - bb2 - c + d) * u * v;
        f += 0.04 * (n1 - 0.5) + 0.012 * (n2 - 0.5);
      }
      const wa = FW[i00] + (FW[i10] - FW[i00]) * tx;
      const wb = FW[i01] + (FW[i11] - FW[i01]) * tx;
      const soft = Math.max(0, wa + (wb - wa) * ty - 0.05) * 0.55;
      const dn = smooth((f - fT + fE) / (2 * fE + soft));
      if (dn > 0) {
        const la = LB[i00] + (LB[i10] - LB[i00]) * tx;
        const lb = LB[i01] + (LB[i11] - LB[i01]) * tx;
        const L = la + (lb - la) * ty;
        let dk = dn;
        if (!fFast) {
          const aa = AL[i00] + (AL[i10] - AL[i00]) * tx;
          const ab = AL[i01] + (AL[i11] - AL[i01]) * tx;
          dk *= aa + (ab - aa) * ty;
        }
        const cr = fSh[0] + (fLit[0] - fSh[0]) * L;
        const cg = fSh[1] + (fLit[1] - fSh[1]) * L;
        const cb = fSh[2] + (fLit[2] - fSh[2]) * L;
        r += (cr - r) * dk;
        g += (cg - g) * dk;
        bl += (cb - bl) * dk;
      }
    }
    if (fSea && y > fSea[x]) {
      const k = Math.min(1, y - fSea[x]); /* top bank's own antialias row */
      let li = 0;
      for (let j = 1; j < NS; j++)
        if (seaE[j * cols + x] < seaE[li * cols + x]) li = j;
      const hv = SEA[li][4];
      const cr = fLit[0] + (fLo[0] - fLit[0]) * hv;
      const cg = fLit[1] + (fLo[1] - fLit[1]) * hv;
      const cb = fLit[2] + (fLo[2] - fLit[2]) * hv;
      r += (cr - r) * k;
      g += (cg - g) * k;
      bl += (cb - bl) * k;
    }
    return pack(r, g, bl);
  }

  /* The per-cell part of the wispy coarse pass; per-frame inputs in c*. */
  let cT = 0;
  let cTw = 0;
  let cS = 0;
  let cSx = 0;
  let cSy = 0;
  let cTm = 0;
  let cMAmp = 0;
  let cR = 0;
  let cR2 = 0;
  let cHaze = false;
  let cSea = false;
  let cDecay = 0;
  let cOdk = 0;
  let cSpan = 0;
  let cB0 = 0;
  let cB1 = 0;
  function coarseWispy() {
    for (let gy = 0; gy < gr; gy++) {
      const yn = (gy * kc) / H;
      const v = gy * cS * 1.35 + cSy;
      const cov =
        (promo
          ? 0
          : yn > 0.5
            ? (yn - 0.5) * (cHaze ? 0.9 : cSea ? 0.6 : 0.42)
            : 0) + (yn < 0.08 && !promo ? (0.08 - yn) * 0.8 : 0);
      const my = gy - mouse.y;
      {
        const ly = (gy / LQ) | 0;
        const ty = (gy - ly * LQ) / LQ;
        const a = ly * lc;
        const b = a + lc;
        for (let i = 0; i < lc; i++) {
          rwW[i] = LW[a + i] + (LW[b + i] - LW[a + i]) * ty;
          rw1[i] = L1[a + i] + (L1[b + i] - L1[a + i]) * ty;
          rw2[i] = L2[a + i] + (L2[b + i] - L2[a + i]) * ty;
          rwP[i] = LP[a + i] + (LP[b + i] - LP[a + i]) * ty;
        }
      }
      for (let gx = 0; gx < gc; gx++) {
        const o = gy * gc + gx;
        const u = gx * cS + cSx;
        let cut = cov + (calmMap ? calmMap[o] : 0) * (promo ? 0.3 : 0.42);
        let mk = 0;
        if (cMAmp > 0.01) {
          const dx = gx - mouse.x;
          const dd = dx * dx + my * my;
          if (dd < cR2) {
            mk = 1 - Math.sqrt(dd) / cR;
            mk = mk * mk * cMAmp;
            cut += mk * 0.1;
          }
        }
        const li = lxi[gx];
        const lt = ltx[gx];
        const w = rwW[li] + (rwW[li + 1] - rwW[li]) * lt;
        let uu = u + w * 0.5;
        let vv = v + w * 0.3;
        let f = rw1[li] + (rw1[li + 1] - rw1[li]) * lt;
        const f2 = rw2[li] + (rw2[li + 1] - rw2[li]) * lt;
        if (f2 > f) {
          f = f2;
          uu += cB0;
          vv += cB1;
        }
        let lbias = 0;
        if (promo) {
          f = 0.24 + 0.56 * Math.min(1.5, MB[o] / 0.75) + 0.36 * (f - 0.45);
          if (MB[o] > 0.01) lbias = depthAt(o);
          else AL[o] = 1;
        }
        let b3 = 0.6;
        let b4 = 0.6;
        let Fv: number;
        if (f + 0.3 - cut > cTw - 0.12) {
          const n3 = noise(
            uu * 4.1 + cTm * 0.016 + 3.3,
            vv * 4.1 - cTm * 0.011 + 1.7
          );
          const n4 = noise(
            uu * 8.3 - cTm * 0.022 + 8.8,
            vv * 8.3 + cTm * 0.015 + 2.2
          );
          const q3 = n3 * 2 - 1;
          const q4 = n4 * 2 - 1;
          b3 = 1 - q3 * q3;
          b4 = 1 - q4 * q4;
          Fv = f + 0.2 * b3 + 0.08 * b4 - 0.17 - cut;
        } else Fv = f - 0.12 - cut;
        Fv += cT - cTw;
        let fw = 0.008;
        if (Fv > cT - 0.16) {
          const xp = gx * kc;
          const e = Math.min(xp, W - xp) / cSpan;
          const sideK = e < 1 ? (1 - e) * (1 - e) : 0;
          const pn = rwP[li] + (rwP[li + 1] - rwP[li]) * lt;
          fw = 0.008 + 0.05 * smooth((pn - 0.45) / 0.3) + sideK * 0.05;
        }
        const dens = smooth((Fv - cT) / 0.07);
        let L: number;
        if (dens > 0) {
          od[gx] = od[gx] * cDecay + dens * cOdk;
          L =
            Math.exp(-od[gx] * 0.42) * 0.8 +
            0.24 +
            (b3 - 0.6) * 0.34 +
            (b4 - 0.6) * 0.22 +
            mk * 0.3;
          if (promo) L += lbias + hov * 0.1;
        } else {
          od[gx] *= cDecay;
          L = 1;
        }
        F[o] = Fv;
        LB[o] = L < 0 ? 0 : L > 1 ? 1 : L;
        FW[o] = fw;
        if (!promo) AL[o] = 1;
      }
    }
  }

  const ez = (f: number, k: number) => 1 - Math.pow(1 - k, f);
  /* Restamp one dot cell: clear the old dot, stamp the new. */
  function setCell(ci: number, cx: number, cy: number, key: number) {
    const q = cy * PITCH * dW + cx * PITCH;
    if (cellKey[ci])
      for (let yy = 0; yy < PITCH; yy++) {
        const qq = q + yy * dW;
        d32[qq] = 0;
        d32[qq + 1] = 0;
        d32[qq + 2] = 0;
        d32[qq + 3] = 0;
      }
    cellKey[ci] = key;
    if (cx < dX0) dX0 = cx;
    if (cx > dX1) dX1 = cx;
    if (cy < dY0) dY0 = cy;
    if (cy > dY1) dY1 = cy;
    if (!key) return;
    const lv = (key & 255) - 1;
    const off = stampOff[lv];
    const cl = key >> 8;
    const v = stampV[cl - 1][lv];
    for (let j = 0; j < off.length; j++) d32[q + off[j]] = v[j];
  }

  function draw(ts: number, full?: boolean) {
    const t = reduced ? 42 : (ts - t0) / 1000;
    const vPx = driftPxPerSecond(W);
    if (reduced) {
      ta = 42;
      pos = 42 * vPx;
    } else if (lastT >= 0) {
      /* Rest: ease the drift speed, never the position (see fl). */
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      fl = easeDrift(fl, dt, pageRest.idle);
      const sp = driftSpeed(fl);
      ta += dt * sp;
      pos += dt * sp * vPx;
    } else {
      ta = t;
      pos = t * vPx;
    }
    /* Easing is per time, not per frame (tuned at 30 fps). */
    const fk = lastT >= 0 ? Math.min(3, Math.max(0, t - lastT) * 30) : 1;
    lastT = t;
    hov += (hovOn - hov) * (reduced ? 1 : ez(fk, 0.16));
    if (!pal) readPalette(true);
    if (!base) buildBase();
    if (!calmMap) buildCalm();
    easeCalm(ez(fk, 0.1));
    if (!side) buildSide();
    const P = pal as Palette;
    const sideMap = side as Float32Array;
    const bs = base as Float32Array;
    const d = img.data;
    const kf = kc / 2;
    const size = Math.max(150, Math.min(560, H * 0.55));
    const S = kc / size;
    const dir = seed[2];
    const sx = seed[0] + (dir * pos) / size;
    const sy = seed[1];
    if (mouse.fresh) {
      mouse.fresh = false;
      const r = root.getBoundingClientRect();
      mouse.tx = (mouse.cx - r.left) / kc;
      mouse.ty = (mouse.cy - r.top) / kc;
      if (mouse.snap) {
        mouse.snap = false;
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      }
    }
    /* Hover follows the pointer closely. */
    {
      const km = ez(fk, 0.3);
      mouse.x += (mouse.tx - mouse.x) * km;
      mouse.y += (mouse.ty - mouse.y) * km;
    }
    mouse.amp += (mouse.on - mouse.amp) * ez(fk, 0.06);
    const R = 170 / kc;
    const R2 = R * R;
    const mAmp = reduced ? 0 : mouse.amp;
    const T = 0.61 - (intensity - 1) * 0.06 - P.cover;
    const decay = Math.exp(-kc / 70);
    const odk = kc / 26;
    const sea = hz === "cloudsea";
    const haze = hz === "haze";
    const spanSide = Math.max(120, W * 0.2);
    const tm = ta * 0.6 * MORPH;
    od.fill(0);

    /* 0 - Cloud sea: five banks of cloud tops, far (small, hazy) to near (big,
       bright), each a row of round puffs (squashed circles), lit at the top
       and shaded down into the gap before the next bank. Full skies alternate
       two kinds of frame: (0) recompute the cloud field and the sea, repaint
       everything; (1) reuse that field slid sideways by the drift, repaint
       only the cloud pixels, restamp the dots. */
    const ph = big && !full && !reduced && !busyHover() ? frameTick++ & 1 : -1;
    const doField =
      ph !== 1 || !fieldOk || promo || cm === "puff" || fieldS !== S;
    const dlt = doField ? 0 : (sx - fieldSx) / S;
    if (doField) {
      fieldOk = true;
      fieldSx = sx;
      fieldS = S;
    }
    let seaTop: Float32Array | null = null;
    if (sea && !doField) seaTop = seaTopBuf;
    else if (sea) {
      seaTop = seaTopBuf;
      seaTop.fill(rows);
      for (let li = 0; li < NS; li++) {
        const Ly = SEA[li];
        const e = seaEdge[li];
        const per = Ly[2] * Math.min(1.3, Math.max(0.7, W / 1200));
        const sp = per * 0.62;
        const rr = per * 0.5;
        const sq = Ly[1];
        const off = seed[1] * 97 + li * 41.7 + dir * pos * Ly[3];
        const by = Ly[0] * H;
        /* The puffs this frame can touch, hashed once per bank (not per column). */
        const sp2 = sp * 0.42;
        const kA = Math.floor(off / sp) - 2;
        const kB = Math.min(
          kA + seaCx.length - 1,
          Math.floor(((cols - 1) * kf + off) / sp) + 2
        );
        for (let k = kA; k <= kB; k++) {
          seaCx[k - kA] = (k + 0.5 + (hash3(k, li, 7) - 0.5) * 0.9) * sp;
          seaRr[k - kA] =
            rr *
            (0.4 + 0.8 * hash3(k, li, 9)) *
            (1 + 0.06 * Math.sin(tm * 0.08 + k * 1.7));
        }
        const jA = Math.floor(off / sp2) - 1;
        const jB = Math.min(
          jA + seaCx2.length - 1,
          Math.floor(((cols - 1) * kf + off) / sp2) + 1
        );
        for (let k = jA; k <= jB; k++) {
          seaCx2[k - jA] = (k + 0.5 + (hash3(k, li, 11) - 0.5) * 0.8) * sp2;
          seaRr2[k - jA] = rr * 0.3 * (0.5 + 0.7 * hash3(k, li, 13));
        }
        for (let x = 0; x < cols; x++) {
          const xp = x * kf + off;
          const k0 = Math.floor(xp / sp);
          let top = -rr * 0.3;
          for (
            let k = Math.max(kA, k0 - 2), kz = Math.min(kB, k0 + 2);
            k <= kz;
            k++
          ) {
            const r = seaRr[k - kA];
            const dx = xp - seaCx[k - kA];
            if (dx > -r && dx < r) {
              const hgt = Math.sqrt(r * r - dx * dx) - r * 0.45;
              if (hgt > top) top = hgt;
            }
          }
          /* Small puffs riding on the domes: the cauliflower rim. */
          const j0 = Math.floor(xp / sp2);
          let sm = 0;
          for (
            let k = Math.max(jA, j0 - 1), kz = Math.min(jB, j0 + 1);
            k <= kz;
            k++
          ) {
            const r = seaRr2[k - jA];
            const dx = xp - seaCx2[k - jA];
            if (dx > -r && dx < r) {
              const hgt = Math.sqrt(r * r - dx * dx) - r * 0.35;
              if (hgt > sm) sm = hgt;
            }
          }
          top += sm * 0.8;
          const und =
            (noise(xp / (per * 3.5), li * 9.1 + 0.3) - 0.5) * rr * 0.9;
          const yy = (by - (top + und) * sq) / kf;
          e[x] = yy;
          if (yy < seaTop[x]) seaTop[x] = yy;
        }
      }
    }

    if (!doField) {
      /* the field stays */
    } else if (cm !== "puff") {
      const Tw = T + 0.012;
      /* Promo: the layout (PROMO metaballs) decides where clouds are; the
         wispy noise only shapes their edges. */
      if (promo) accumClouds(tm, dir, ta);
      /* 1 - Coarse pass (default "wispy"): the realistic streaky cumulus:
         domain-warped value noise gathered into heaps, a billow term rounding
         the rims, lit by optical depth down each column. F is the field, L the
         light, FW how wide the dotted fringe is. The same cumulus field is
         read twice, the second copy offset in noise space, and the denser of
         the two wins. All of them thin out behind data-px-calm content. The
         warp, both banks' base octaves and the fringe-width noise are smooth
         over dozens of cells: evaluated on a lattice every LQ cells and
         interpolated; only the billow octaves near an edge run per cell. */
      const t6 = tm * 0.006;
      const t4 = tm * 0.004;
      const t8 = tm * 0.008;
      const t5 = tm * 0.005;
      const t2 = tm * 0.002;
      const B0 = BANK2[0];
      const B1 = BANK2[1];
      const B2 = BANK2[2];
      for (let ly = 0; ly < lr; ly++) {
        const v = ly * LQ * S * 1.35 + sy;
        for (let lx = 0, o = ly * lc; lx < lc; lx++, o++) {
          const u = lx * LQ * S + sx;
          const w = noise(u * 0.7 + t6, v * 0.7 - t4) - 0.5;
          const uu = u + w * 0.5;
          const vv = v + w * 0.3;
          const ub = uu + B0;
          const vb = vv + B1;
          LW[o] = w;
          L1[o] =
            0.55 * noise(uu * 0.9, vv * 0.9) +
            0.2 * noise(uu * 1.9 + 5.2 - t8, vv * 1.9 + 7.1 + t5);
          L2[o] =
            0.55 * noise(ub * 0.9, vb * 0.9) +
            0.2 * noise(ub * 1.9 + 5.2 - t8, vb * 1.9 + 7.1 + t5) -
            B2;
          LP[o] = noise(u * 0.5 + 70.3, v * 0.5 + 12.1 + t2);
        }
      }
      cT = T;
      cTw = Tw;
      cS = S;
      cSx = sx;
      cSy = sy;
      cTm = tm;
      cMAmp = mAmp;
      cR = R;
      cR2 = R2;
      cHaze = haze;
      cSea = sea;
      cDecay = decay;
      cOdk = odk;
      cSpan = spanSide;
      cB0 = B0;
      cB1 = B1;
      coarseWispy();
    } else {
      /* 1 - Coarse pass ("puff"). Each cumulus is a cluster of round puffs
         summed as metaballs (domed top, flat base), its rim broken up by
         billow noise. */
      accumClouds(tm, dir, ta);
      for (let gy = 0; gy < gr; gy++) {
        const v = gy * S * 1.35 + sy;
        const my = gy - mouse.y;
        for (let gx = 0; gx < gc; gx++) {
          const o = gy * gc + gx;
          const m = MB[o];
          let cut = (calmMap ? calmMap[o] : 0) * 0.5;
          if (m < 0.02) {
            F[o] = T - 0.3;
            FW[o] = 0.02;
            AL[o] = 1;
            od[gx] *= decay;
            continue;
          }
          const lbias = depthAt(o);
          let mk = 0;
          if (mAmp > 0.01) {
            const dx = gx - mouse.x;
            const dd = dx * dx + my * my;
            if (dd < R2) {
              mk = 1 - Math.sqrt(dd) / R;
              mk = mk * mk * mAmp;
              cut += mk * 0.12;
            }
          }
          const u = gx * S + sx;
          const n3 = noise(
            u * 4.1 + tm * 0.016 + 3.3,
            v * 4.1 - tm * 0.011 + 1.7
          );
          const n4 = noise(
            u * 9.3 - tm * 0.022 + 8.8,
            v * 9.3 + tm * 0.015 + 2.2
          );
          const q3 = n3 * 2 - 1;
          const q4 = n4 * 2 - 1;
          const b3 = 1 - q3 * q3;
          const b4 = 1 - q4 * q4;
          const Fv =
            T +
            (m - 0.42) * 0.42 +
            (b3 - 0.62) * (promo ? 0.3 : 0.22) +
            (b4 - 0.62) * (promo ? 0.13 : 0.08) -
            cut;
          const xp = gx * kc;
          const e = Math.min(xp, W - xp) / spanSide;
          const sideK = e < 1 ? (1 - e) * (1 - e) : 0;
          const pn = noise(u * 0.6 + 70.3, v * 0.6 + 12.1 + tm * 0.002);
          const fw = 0.02 + 0.15 * smooth((pn - 0.38) / 0.32) + sideK * 0.1;
          const dens = smooth((Fv - T) / 0.06);
          od[gx] = od[gx] * decay + dens * odk;
          const pl = PL[o] / (MB[o] + 0.05);
          const L =
            Math.exp(-od[gx] * 0.5) * 0.66 +
            0.24 +
            pl * 0.2 +
            (b3 - 0.6) * 0.3 +
            (b4 - 0.6) * 0.14 +
            mk * 0.2 +
            lbias +
            (promo ? hov * 0.1 : 0);
          F[o] = Fv;
          LB[o] = L < 0 ? 0 : L > 1 ? 1 : L;
          FW[o] = fw;
        }
      }
    }

    /* 2 - Fine pass at 1/2 res: crisp smoothstep edge + detail octave. */
    const lit = P.lit;
    const sh = P.shade;
    const lo = P.low;
    const E = cm === "puff" ? 0.013 : 0.024;
    const dsc = S * 7.5;
    const dvs = S * 7.5 * 1.35;
    const dox = sx * 15;
    const doy = sy * 15;
    for (let li = 0; li < NS; li++)
      seaInvBuf[li] = kf / (SEA[li][2] * SEA[li][1] * 0.75);
    const thF = T - 0.03;
    /* Interior fast path (full skies: opaque clouds): past T + E + the widest
       soft edge, dn = 1 and the alpha is 1. */
    const fastIn = !promo && cm !== "puff";
    const thIn = T + E + 0.035;
    if (fastIn && cloudLutSig !== palSig) {
      cloudLutSig = palSig;
      for (let q = 0; q < 256; q++) {
        const L = q / 255;
        cloudLut[q] = pack(
          sh[0] + (lit[0] - sh[0]) * L,
          sh[1] + (lit[1] - sh[1]) * L,
          sh[2] + (lit[2] - sh[2]) * L
        );
      }
    }
    noiseAxis(nXi, nXu, cols, dsc, dox, 257);
    noiseAxis(nXi2, nXu2, cols, dsc * 2.3, dox * 2.3 + 17, 257);
    noiseAxis(nYi, nYv, rows, dvs, doy, 1);
    noiseAxis(nYi2, nYv2, rows, dvs * 2.3, doy * 2.3, 1);
    fSea = seaTop;
    fFast = fastIn;
    fThIn = thIn;
    fSh = sh;
    fLit = lit;
    fLo = lo;
    fT = T;
    fE = E;
    /* Fine column -> coarse cell and weight (with the slide, clamped at the edges). */
    for (let g = 0; g < gc; g++) {
      qA[g] = cols;
      qB[g] = 0;
    }
    for (let x = 0; x < cols; x++) {
      const gf = x * 0.5 + dlt;
      let g = Math.floor(gf);
      let tt = gf - g;
      if (g < 0) {
        g = 0;
        tt = 0;
      } else if (g > gc - 2) {
        g = gc - 2;
        tt = 1;
      }
      xg[x] = g;
      xt[x] = tt;
      if (x < qA[g]) qA[g] = x;
      qB[g] = x + 1;
    }
    /* The clear sky is the static base: copy it, then visit only the 2x2 pixel
       quads whose coarse cell corners reach a cloud edge, and each column
       below its cloud-sea top. */
    if (doField) D32.set(base32);
    else
      for (let i = 0; i < cloudN; i++) {
        const o = cloudList[i];
        D32[o] = base32[o]; /* last frame's cloud pixels */
      }
    cloudN = 0;
    for (let gy0 = 0, gyN = (rows + 1) >> 1; gy0 < gyN; gy0++) {
      const rowA = gy0 * gc;
      const rowB = rowA + gc;
      for (let gx0 = 0; gx0 < gc - 1; gx0++) {
        const xa = qA[gx0];
        const xb = qB[gx0];
        if (xb <= xa) continue;
        if (
          F[rowA + gx0] <= thF &&
          F[rowA + gx0 + 1] <= thF &&
          F[rowB + gx0] <= thF &&
          F[rowB + gx0 + 1] <= thF
        )
          continue;
        for (let y = gy0 * 2, y1 = Math.min(rows, y + 2); y < y1; y++)
          for (let x = xa; x < xb; x++) {
            if (ridgeTop && y > ridgeTop[x] + 1) continue;
            if (seaTop && y > seaTop[x]) continue;
            const o = y * cols + x;
            D32[o] = px(x, y);
            cloudList[cloudN++] = o;
          }
      }
    }
    if (seaTop && doField) {
      /* Bank bodies: the shading down from each bank's top is a fixed ramp per
         bank, so the plain body pixels read a 128-step colour table; edges
         (antialias rows, a ridge just below) take the full path. */
      if (seaLutSig !== palSig) {
        seaLutSig = palSig;
        for (let li = 0; li < NS; li++)
          for (let q = 0; q < 128; q++) {
            const dy = q / 127;
            const L = 1 - dy * dy * (3 - 2 * dy) * 0.5;
            const hv = SEA[li][4];
            let cr = sh[0] + (lit[0] - sh[0]) * L;
            let cg = sh[1] + (lit[1] - sh[1]) * L;
            let cb = sh[2] + (lit[2] - sh[2]) * L;
            cr += (lo[0] - cr) * hv;
            cg += (lo[1] - cg) * hv;
            cb += (lo[2] - cb) * hv;
            seaLut[li * 128 + q] = pack(cr, cg, cb);
          }
      }
      /* Column by column, in runs: between two bank tops the nearest bank
         above is fixed, so a run is a walk down that bank's colour ramp. */
      for (let x = 0; x < cols; x++) {
        const st = seaTop[x];
        const yE = ridgeTop
          ? Math.min(rows - 1, Math.floor(ridgeTop[x] + 1))
          : rows - 1;
        let y = Math.max(0, Math.floor(st) + 1);
        for (; y <= yE && y < st + 1.5; y++) D32[y * cols + x] = px(x, y);
        let li = 0;
        while (y <= yE) {
          for (let j = NS - 1; j > li; j--)
            if (seaE[j * cols + x] <= y) {
              li = j;
              break;
            }
          let yN = yE + 1; /* where a nearer bank's top comes next */
          for (let j = li + 1; j < NS; j++) {
            const q = Math.ceil(seaE[j * cols + x]);
            if (q < yN) yN = q;
          }
          const e = seaE[li * cols + x];
          const inv = seaInvBuf[li];
          const lb = li * 128;
          for (; y < yN; y++) {
            const ea = y - e;
            if (ea < 1) {
              D32[y * cols + x] = px(x, y);
              continue;
            }
            const dy = ea * inv;
            D32[y * cols + x] =
              seaLut[lb + (dy >= 1 ? 127 : (dy * 127 + 0.5) | 0)];
          }
        }
      }
    }
    /* Stars, behind the clouds. */
    if (stars.length) {
      for (let i = 0, j = 0; i < stars.length; i += 5, j++) {
        const x = stars[i];
        const y = stars[i + 1];
        const o4 = (y * cols + x) * 4;
        const o3 = (y * cols + x) * 3;
        if (D32[o4 >> 2] === starV[j])
          D32[o4 >> 2] = base32[o4 >> 2]; /* undo last frame's star */
        const cloud =
          Math.abs(d[o4] - bs[o3]) + Math.abs(d[o4 + 2] - bs[o3 + 2]);
        if (cloud > 12) continue;
        const tw =
          stars[i + 2] *
          (reduced
            ? 0.8
            : 0.7 + 0.3 * Math.sin(ta * stars[i + 4] + stars[i + 3]));
        d[o4] += (220 - d[o4]) * tw;
        d[o4 + 1] += (228 - d[o4 + 1]) * tw;
        d[o4 + 2] += (240 - d[o4 + 2]) * tw;
        starV[j] = D32[o4 >> 2];
      }
    }
    ctx!.putImageData(img, 0, 0);

    /* 3 - Halftone: dots in the fringe outside each cloud edge and above each
       cloud-sea bank, plus the static side screen. Stamped at CSS pixels into
       one ImageData. Full skies restamp the dots on every other frame. */
    if (ph !== 0) {
      /* Each 4x4 cell remembers what it shows (cellKey: class << 8 | level+1);
         only cells whose dot changed are cleared and restamped, and only the
         rectangle around them is uploaded. */
      const dc = P.dot;
      const aC = P.night ? 0.45 : 0.85;
      const aS = P.night ? 0.22 : 0.38;
      const thD = T - 0.115;
      if (aLutSig !== palSig || stampW !== dW) {
        aLutSig = palSig;
        stampW = dW;
        for (let q = 0; q <= 32; q++)
          aLut[q] =
            (((Math.min(1, q / 32) * 255) | 0) << 24) |
            (dc[2] << 16) |
            (dc[1] << 8) |
            dc[0];
        stampOff = STAMPS.map((st) => {
          const o = new Int32Array(st.length / 3);
          for (let s = 0; s < st.length; s += 3)
            o[s / 3] = st[s + 1] * dW + st[s];
          return o;
        });
        stampV = [aC, aS].map((a) =>
          STAMPS.map((st) => {
            const v = new Int32Array(st.length / 3);
            for (let s = 0; s < st.length; s += 3)
              v[s / 3] = aLut[Math.round(st[s + 2] * a * 32)];
            return v;
          })
        );
        dotsReset = true;
      }
      if (dotsReset || cellKey.length !== ncx * ncy) {
        dotsReset = false;
        d32.fill(0);
        cellKey = new Int32Array(ncx * ncy);
        dX0 = 0;
        dY0 = 0;
        dX1 = ncx - 1;
        dY1 = ncy - 1;
      } else {
        dX0 = ncx;
        dY0 = ncy;
        dX1 = -1;
        dY1 = -1;
      }
      if (seaTop)
        for (let li = 0; li < NS; li++)
          for (let cx = 0; cx < ncx; cx++)
            seaFw[li * ncx + cx] =
              6 +
              22 *
                smooth(
                  (noise((cx * PITCH + 2) / 90 + li * 7, li + tm * 0.01) -
                    0.35) /
                    0.4
                );
      for (let cy = 0; cy < ncy; cy++) {
        const py = cy * PITCH + 2;
        const gyf = py / kc;
        const gy0 = Math.min(gr - 2, gyf | 0);
        const ty = gyf - gy0;
        const fyr = py / kf;
        for (let cx = 0; cx < ncx; cx++) {
          const pxl = cx * PITCH + 2;
          const fx = Math.min(cols - 1, (pxl / kf) | 0);
          const ci = cy * ncx + cx;
          let wC = 0;
          let bare = true;
          if (!(ridgeTop && fyr > ridgeTop[fx] - 1)) {
            let seaIn = false;
            bare = false;
            if (seaTop && fyr > seaTop[fx] - 40 / kf) {
              /* Above a bank's edge (and over the bank behind it): fringe dots. */
              for (let li = 0; li < NS; li++) {
                const dd = (seaE[li * cols + fx] - fyr) * kf;
                if (dd > 0) {
                  const fwp = seaFw[li * ncx + cx];
                  if (dd < fwp) {
                    const k = 1 - dd / fwp;
                    if (k > wC) wC = k * k;
                  }
                }
              }
              if (fyr >= seaTop[fx]) {
                seaIn = true;
                if (wC < 0.07) bare = true;
              }
            }
            if (!seaIn) {
              let gxf = pxl / kc + dlt;
              if (gxf < 0) gxf = 0;
              else if (gxf > gc - 1.001) gxf = gc - 1.001;
              const gx0 = Math.min(gc - 2, gxf | 0);
              const tx = gxf - gx0;
              const i00 = gy0 * gc + gx0;
              const i10 = i00 + 1;
              const i01 = i00 + gc;
              const i11 = i01 + 1;
              if (
                F[i00] > thD ||
                F[i10] > thD ||
                F[i01] > thD ||
                F[i11] > thD
              ) {
                const fa = F[i00] + (F[i10] - F[i00]) * tx;
                const fb = F[i01] + (F[i11] - F[i01]) * tx;
                const f = fa + (fb - fa) * ty;
                const wa = FW[i00] + (FW[i10] - FW[i00]) * tx;
                const wb = FW[i01] + (FW[i11] - FW[i01]) * tx;
                const fw = wa + (wb - wa) * ty;
                if (fw > 0.035) {
                  const lo2 = T - fw;
                  const hi = T + E + Math.max(0, fw - 0.05) * 0.55;
                  if (f > lo2 && f < hi) {
                    const k = (f - lo2) / (hi - lo2);
                    const c = k * Math.sqrt(k) * AL[i00];
                    if (c > wC) wC = c;
                  }
                }
              }
            }
          }
          let key = 0;
          if (!bare) {
            const wS = sideMap[ci];
            const w = wC >= wS ? wC : wS;
            if (w >= 0.07)
              key =
                ((wC >= wS ? 1 : 2) << 8) |
                (Math.min(NL - 1, (w * NL) | 0) + 1);
          }
          if (key !== cellKey[ci]) setCell(ci, cx, cy, key);
        }
      }
      if (dX1 >= dX0)
        dctx!.putImageData(
          dimg,
          0,
          0,
          dX0 * PITCH,
          dY0 * PITCH,
          (dX1 - dX0 + 1) * PITCH,
          (dY1 - dY0 + 1) * PITCH
        );
    }
    if (!shown) reveal();
  }

  /* Frame pacing: see sky-rest.ts. */
  function loop(ts: number) {
    raf = 0;
    if (stopped || !mayAnimate({ hidden, inView, reduced, covered, parked }))
      return;
    /* Rest: the page is idle, the drift has eased to 0 and every hover / calm
       easing has settled: paint one full frame and stop scheduling. The next
       input wakes it (the shared detector calls kick). */
    if (atRest({ idle: pageRest.idle, drift: fl, settled: settled() })) {
      if (!restDrawn) {
        restDrawn = true;
        draw(ts, true);
      }
      return;
    }
    restDrawn = false;
    raf = requestAnimationFrame(loop);
    /* While the pointer is in the sky (or a hover is easing) small skies run at
       display rate and full skies at 30 fps with a full field each frame. */
    const hv = busyHover();
    const fm = framePeriod({ big, hover: hv, fps: opt.fps });
    if (ts - last < fm - 4) return;
    /* 24 fps on a 60 Hz display is an even 2/3-vsync cadence: step the clock
       by frameMs instead of snapping it to ts. */
    last = !hv && !big && ts - last < fm * 2 ? last + fm : ts;
    if (ts - lastPal > 1000) {
      lastPal = ts;
      readPalette(false);
      readCalm();
    }
    draw(ts);
  }
  function busyHover() {
    return mouse.on === 1 || mouse.amp > 0.02 || Math.abs(hovOn - hov) > 0.003;
  }
  /* Nothing left to ease: the pointer brush has reached the cursor and its
     strength its target, the promo hover and the calm map are settled. */
  function settled() {
    return (
      !calmLive &&
      Math.abs(mouse.on - mouse.amp) < 0.02 &&
      Math.abs(hovOn - hov) < 0.003 &&
      (mouse.on === 0 ||
        (Math.abs(mouse.tx - mouse.x) < 0.5 &&
          Math.abs(mouse.ty - mouse.y) < 0.5 &&
          !mouse.fresh))
    );
  }
  let restDrawn = false;
  function kick() {
    if (
      booted &&
      !raf &&
      !stopped &&
      mayAnimate({ hidden, inView, reduced, covered, parked })
    )
      raf = requestAnimationFrame(loop);
  }
  function still() {
    readPalette(false);
    draw(performance.now(), true);
  }
  /* Covered: every sample point inside the viewport hits something outside
     this sky that is painted opaque. Translucent overlays, popovers over a
     part of the sky, or pointer-events quirks all count as visible. */
  function opaqueHit(el: Element): boolean {
    let n: Element | null = el;
    for (let i = 0; n && i < 6 && !n.contains(root); n = n.parentElement, i++) {
      const cs = window.getComputedStyle(n);
      if (cs.opacity !== "1" || cs.visibility === "hidden") return false;
      const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      if (m) {
        const a = m[1].split(",");
        if (a.length < 4 || parseFloat(a[3]) >= 0.97) return true;
      }
      if (
        n.tagName === "CANVAS" ||
        n.tagName === "IMG" ||
        n.tagName === "VIDEO"
      )
        return true;
    }
    return false;
  }
  function checkCovered(): boolean {
    if (typeof document.elementFromPoint !== "function") return false;
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let seen = 0;
    for (let i = 0; i < 5; i++) {
      const fx = i === 0 ? 0.5 : i & 1 ? 0.1 : 0.9;
      const fy = i === 0 ? 0.5 : i < 3 ? 0.1 : 0.9;
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      seen++;
      const el = document.elementFromPoint(x, y);
      if (!el || root.contains(el) || el.contains(root) || !opaqueHit(el))
        return false;
    }
    return seen > 0;
  }

  /* Mount without a long task: measure now; build the static layers and draw
     the first frame in three idle slices. Until then the canvases are hidden
     (the sky's ground colour shows, never an unpainted black canvas) and the
     first frame fades in. */
  let booted = false;
  let shown = false;
  canvas.style.opacity = "0";
  dotCanvas.style.opacity = "0";
  function reveal() {
    shown = true;
    const tr = reduced ? "" : "opacity 220ms ease";
    canvas.style.transition = tr;
    dotCanvas.style.transition = tr;
    canvas.style.opacity = "";
    dotCanvas.style.opacity = "";
  }
  resize();
  readPalette(true);
  readCalm();
  const bootSteps: Array<() => void> = [
    () => {
      if (!base) buildBase();
    },
    () => {
      if (!side) buildSide();
    },
    () => {
      booted = true;
      draw(performance.now(), true);
      kick();
    },
  ];
  let bootId = 0;
  const bootNext = () => {
    bootId = 0;
    if (stopped) return;
    const step = bootSteps.shift();
    if (step) step();
    if (bootSteps.length) bootId = ric(bootNext, 40);
  };
  bootId = ric(bootNext, 60);
  const calmT = window.setTimeout(() => {
    readCalm();
    if (reduced) draw(performance.now(), true);
  }, 420);
  const ro =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          const r = root.getBoundingClientRect();
          if (Math.max(1, r.width) === W && Math.max(1, r.height) === H)
            return; /* the initial callback, or no change */
          needResize = true;
          schedule();
        })
      : null;
  if (ro) ro.observe(root);
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((es) => {
          inView = es[es.length - 1].isIntersecting;
          kick();
        })
      : null;
  if (io) io.observe(root);
  const onVis = () => {
    hidden = document.hidden;
    kick();
  };
  document.addEventListener("visibilitychange", onVis);
  /* A theme change (data-theme on the scope) picks a new mood at once, even
     while the sky is resting. */
  const themed = root.closest("[data-theme]");
  const mo =
    themed && typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          readPalette(true);
          draw(performance.now(), true);
        })
      : null;
  if (mo && themed)
    mo.observe(themed, { attributes: true, attributeFilter: ["data-theme"] });
  const onMq = () => {
    reduced = !!(mq && mq.matches);
    still();
    kick();
  };
  if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
  const slow = window.setInterval(() => {
    if (stopped || hidden || !inView || parked || (!raf && pageRest.idle))
      return;
    if (reduced) {
      const a = readCalm();
      const b = readPalette(false);
      if (a || b) draw(performance.now(), true);
      return;
    }
    const c = checkCovered();
    if (c !== covered) {
      covered = c;
      kick();
    }
  }, 1000);
  const onMove = (e: PointerEvent) => {
    if (opt.interactive === false) return;
    if (e.pointerType === "touch" && !mouse.touch) return;
    mouse.cx = e.clientX;
    mouse.cy = e.clientY;
    mouse.fresh = true;
    if (mouse.on === 0) {
      mouse.snap = true;
      mouse.on = 1;
      kick();
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (!e || e.pointerType !== "touch") mouse.on = 0;
  };
  /* Touch: the brush follows a finger. It lands on pointerdown, follows
     touchmove and fades on pointerup / touchend / touchcancel. Every listener
     is passive and none calls preventDefault, so the page still scrolls under
     the finger. */
  const onDown = (e: PointerEvent) => {
    if (opt.interactive === false || e.pointerType !== "touch") return;
    mouse.touch = true;
    mouse.cx = e.clientX;
    mouse.cy = e.clientY;
    mouse.fresh = true;
    if (mouse.on === 0) mouse.snap = true;
    mouse.on = 1;
    kick();
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!mouse.touch || !e.touches || !e.touches.length) return;
    mouse.cx = e.touches[0].clientX;
    mouse.cy = e.touches[0].clientY;
    mouse.fresh = true;
    kick();
  };
  const onTouchEnd = (e: Event) => {
    const pe = e as PointerEvent;
    if (
      e.type === "pointercancel" ||
      (pe.pointerType && pe.pointerType !== "touch")
    )
      return;
    const te = e as TouchEvent;
    if (te.touches && te.touches.length) return;
    if (mouse.touch) {
      mouse.touch = false;
      mouse.on = 0;
      kick();
    }
  };
  const tOpt = { passive: true } as const;
  let scrollT = 0;
  let scrollEnd = 0;
  const onScroll = () => {
    window.clearTimeout(scrollEnd);
    scrollEnd = window.setTimeout(() => {
      readCalm();
      if (reduced) draw(performance.now(), true);
      else kick();
    }, 120);
    const n = performance.now();
    if (n - scrollT < 80) return;
    scrollT = n;
    readCalm();
    if (reduced) draw(n, true);
    else kick();
  };
  scope.addEventListener("scroll", onScroll, { capture: true, passive: true });
  scope.addEventListener("pointermove", onMove, tOpt);
  scope.addEventListener("pointerleave", onLeave, tOpt);
  scope.addEventListener("pointerdown", onDown, tOpt);
  scope.addEventListener("pointerup", onTouchEnd, tOpt);
  scope.addEventListener("touchmove", onTouchMove, tOpt);
  scope.addEventListener("touchend", onTouchEnd, tOpt);
  scope.addEventListener("touchcancel", onTouchEnd, tOpt);
  /* Promo hover / keyboard focus: the clouds part and brighten. */
  const fv = (el: Element) => {
    try {
      return el.matches(":focus-visible");
    } catch {
      return false;
    }
  };
  let hovPtr = 0;
  let hovKey = 0;
  const hovSet = () => {
    hovOn = hovPtr || hovKey ? 1 : 0;
    if (reduced) {
      hov = hovOn;
      draw(performance.now(), true);
    } else kick();
  };
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== "touch") {
      hovPtr = 1;
      hovSet();
    }
  };
  const onExit = () => {
    hovPtr = 0;
    hovSet();
  };
  const onFocus = () => {
    hovKey = promoHost && fv(promoHost) ? 1 : 0;
    hovSet();
  };
  const onBlur = () => {
    hovKey = 0;
    hovSet();
  };
  if (promoHost) {
    promoHost.addEventListener("pointerenter", onEnter);
    promoHost.addEventListener("pointerleave", onExit);
    promoHost.addEventListener("focus", onFocus);
    promoHost.addEventListener("blur", onBlur);
  }
  kick();
  return {
    set(mood, dark) {
      opt.mood = mood;
      opt.dark = dark;
      readPalette(true);
      draw(performance.now(), true);
    },
    /* Parked: no frames at all (the last one stays painted): for a sky in a
       layer that is closed, sliding or being dragged. */
    park(v) {
      const was = parked;
      parked = !!v;
      if (was && !parked) {
        last = 0;
        kick();
      }
    },
    stop() {
      joined.leave();
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (idleId) cic(idleId);
      if (bootId) cic(bootId);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (mo) mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scope.removeEventListener("scroll", onScroll, { capture: true });
      window.clearTimeout(scrollEnd);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
      window.clearInterval(slow);
      window.clearTimeout(calmT);
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
      scope.removeEventListener("pointerdown", onDown);
      scope.removeEventListener("pointerup", onTouchEnd);
      scope.removeEventListener("touchmove", onTouchMove);
      scope.removeEventListener("touchend", onTouchEnd);
      scope.removeEventListener("touchcancel", onTouchEnd);
      if (promoHost) {
        promoHost.removeEventListener("pointerenter", onEnter);
        promoHost.removeEventListener("pointerleave", onExit);
        promoHost.removeEventListener("focus", onFocus);
        promoHost.removeEventListener("blur", onBlur);
      }
    },
  };
}
