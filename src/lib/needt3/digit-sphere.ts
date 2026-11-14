/**
 * The digit sphere on the sign-in screen: a slowly turning globe of the digits
 * 0 to 9, near ones large and strong, far ones small and faint.
 *
 * Two halves, kept in one file so the standalone demo can inline exactly this
 * code (docs/handoff/evidence/login-sphere/demo.html is built from it):
 *
 *  - pure math (Fibonacci points, rotation and perspective, depth to size and
 *    to a rung of the alpha ladder): unit-tested, no DOM;
 *  - `startDigitSphere`: Canvas 2D engine. One rAF, no allocation per frame,
 *    glyphs blitted from a pre-rendered atlas (one cell per digit and size
 *    bucket), paused while the tab is hidden or the canvas is off screen,
 *    one still frame under prefers-reduced-motion.
 *
 * Ink is the theme's own text colour (`--foreground-rgb`) at rungs of the
 * ladder from docs/handoff/PORT.md section 0 rule 1, never a hard-coded white,
 * so it is dark digits on paper and light digits on the dark ground.
 */

/** Alpha rungs, far to near. Every value is a step of PORT's ladder. */
export const SPHERE_ALPHAS_FULL: readonly number[] = [
  0.12, 0.25, 0.4, 0.55, 0.7, 0.85,
];
/** The same ladder, one notch down, for when the sphere sits behind a form. */
export const SPHERE_ALPHAS_QUIET: readonly number[] = [
  0.04, 0.06, 0.08, 0.12, 0.25, 0.4,
];

/** Seconds per full turn about the vertical axis. */
export const SPHERE_TURN_SECONDS = 50;
/** Fixed tilt about the horizontal axis, radians (about 16 degrees). */
export const SPHERE_TILT = 0.28;
/** Camera distance in sphere radii. */
export const SPHERE_CAMERA = 3;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Digits to draw for a canvas this wide (css px): fewer on small screens. */
export function sphereCount(width: number): number {
  if (width < 700) return 300;
  if (width < 1100) return 400;
  return 480;
}

/** `n` points evenly spread over the unit sphere, as x,y,z triples. */
export function fibonacciSphere(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLDEN_ANGLE;
    out[i * 3] = Math.cos(a) * ring;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * ring;
  }
  return out;
}

/** Which digit each point shows: a fixed shuffle, so neighbours differ. */
export function sphereDigits(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = 2463534242;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = s % 10;
  }
  return out;
}

export interface Projected {
  /** Screen offset from the sphere centre, in sphere radii. */
  x: number;
  y: number;
  /** Depth toward the viewer after rotation, -1 (far) to 1 (near). */
  z: number;
  /** Perspective scale, about 0.75 far to 1.5 near. */
  scale: number;
}

/** Rotate a unit-sphere point (yaw about Y, then tilt about X) and project it. */
export function projectPoint(
  x: number,
  y: number,
  z: number,
  yaw: number,
  tilt: number,
  out: Projected = { x: 0, y: 0, z: 0, scale: 1 }
): Projected {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y2 = y * ct - z1 * st;
  const z2 = y * st + z1 * ct;
  const scale = SPHERE_CAMERA / (SPHERE_CAMERA - z2);
  out.x = x1 * scale;
  out.y = y2 * scale;
  out.z = z2;
  out.scale = scale;
  return out;
}

/** Rung (0 = faintest) of a ladder with `steps` rungs for depth z in [-1, 1]. */
export function depthStep(z: number, steps: number): number {
  const t = (Math.min(1, Math.max(-1, z)) + 1) / 2;
  return Math.min(steps - 1, Math.floor(t * steps));
}

/** Alpha for depth z on the given ladder. */
export function depthAlpha(z: number, alphas: readonly number[]): number {
  return alphas[depthStep(z, alphas.length)];
}

/** Glyph height as a share of the sphere radius: scale squared, so the far
    side is clearly small and the near side clearly big. */
export function glyphSize(scale: number, radius: number): number {
  return 0.06 * radius * scale * scale;
}

/** Smallest and largest glyph heights for a radius (scale 0.75 .. 1.5). */
export function glyphRange(radius: number): [number, number] {
  const near = SPHERE_CAMERA / (SPHERE_CAMERA - 1);
  const far = SPHERE_CAMERA / (SPHERE_CAMERA + 1);
  return [glyphSize(far, radius), glyphSize(near, radius)];
}

/** Size bucket 0..buckets-1 for a glyph height, log-spaced across the range. */
export function sizeBucket(
  size: number,
  min: number,
  max: number,
  buckets: number
): number {
  if (buckets < 2 || max <= min) return 0;
  const t = Math.log(Math.max(size, min) / min) / Math.log(max / min);
  return Math.min(buckets - 1, Math.max(0, Math.round(t * (buckets - 1))));
}

export interface DigitSphereOptions {
  /** Fixed frame count: 0 draws once and never schedules. */
  reducedMotion?: boolean;
  /** "quiet" is the lower ladder, for behind a form. Default picks by width. */
  profile?: "full" | "quiet";
  /** Digit font stack. */
  font?: string;
}

export interface DigitSphereHandle {
  stop: () => void;
  /** Re-read size and ink and draw again. */
  refresh: () => void;
}

const BUCKETS = 8;
const STILL_YAW = 0.6;

interface Layout {
  w: number;
  h: number;
  dpr: number;
  cx: number;
  cy: number;
  r: number;
  n: number;
}

/**
 * Start the sphere on `canvas`. It sizes itself to the canvas's css box and
 * keeps the sphere inside it: centred on wide boxes, in the upper part on
 * narrow ones (so a form below stays clear). Returns a handle; call `stop`
 * on unmount.
 */
export function startDigitSphere(
  canvas: HTMLCanvasElement,
  opts: DigitSphereOptions = {}
): DigitSphereHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop() {}, refresh() {} };
  const g: CanvasRenderingContext2D = ctx;

  const win = canvas.ownerDocument.defaultView ?? window;
  const doc = canvas.ownerDocument;
  const fontStack =
    opts.font ?? 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  let reduced = !!opts.reducedMotion;
  let onScreen = true;
  let raf = 0;
  let yaw = STILL_YAW;
  let last = 0;
  let L: Layout = { w: 0, h: 0, dpr: 1, cx: 0, cy: 0, r: 0, n: 0 };
  let ink = "26, 28, 30";
  let alphas = SPHERE_ALPHAS_FULL;

  let pts: Float32Array = new Float32Array(0);
  let digs: Uint8Array = new Uint8Array(0);
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let sBucket = new Uint8Array(0);
  let sStep = new Uint8Array(0);

  let atlas: HTMLCanvasElement | null = null;
  const cellW = new Int32Array(BUCKETS);
  const cellH = new Int32Array(BUCKETS);
  const rowY = new Int32Array(BUCKETS);
  let gMin = 0;
  let gMax = 0;

  const proj: Projected = { x: 0, y: 0, z: 0, scale: 1 };

  function readInk() {
    const v = win
      .getComputedStyle(canvas)
      .getPropertyValue("--foreground-rgb")
      .trim();
    if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v)) ink = v;
  }

  function buildAtlas() {
    const [lo, hi] = glyphRange(L.r);
    gMin = lo;
    gMax = hi;
    let total = 0;
    let wide = 0;
    for (let b = 0; b < BUCKETS; b++) {
      const size = lo * Math.pow(hi / lo, b / (BUCKETS - 1));
      const px = Math.max(6, size * L.dpr);
      cellW[b] = Math.ceil(px * 0.8);
      cellH[b] = Math.ceil(px * 1.2);
      rowY[b] = total;
      total += cellH[b];
      wide = Math.max(wide, cellW[b] * 10);
    }
    const a = doc.createElement("canvas");
    a.width = wide;
    a.height = total;
    const ax = a.getContext("2d");
    if (!ax) {
      atlas = null;
      return;
    }
    ax.fillStyle = `rgb(${ink})`;
    ax.textAlign = "center";
    ax.textBaseline = "middle";
    for (let b = 0; b < BUCKETS; b++) {
      const size = lo * Math.pow(hi / lo, b / (BUCKETS - 1));
      ax.font = `400 ${Math.max(6, size * L.dpr)}px ${fontStack}`;
      for (let d = 0; d < 10; d++) {
        ax.fillText(
          String(d),
          d * cellW[b] + cellW[b] / 2,
          rowY[b] + cellH[b] / 2
        );
      }
    }
    atlas = a;
  }

  function layout() {
    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    readInk();
    const narrow = w < 700;
    const r = narrow ? Math.min(w * 0.42, h * 0.3) : Math.min(w, h) * 0.4;
    const cx = w / 2;
    const cy = narrow ? h * 0.3 : h / 2;
    const n = sphereCount(w);
    alphas =
      opts.profile === "full"
        ? SPHERE_ALPHAS_FULL
        : opts.profile === "quiet" || narrow
          ? SPHERE_ALPHAS_QUIET
          : SPHERE_ALPHAS_FULL;
    const resized = w !== L.w || h !== L.h || dpr !== L.dpr;
    L = { w, h, dpr, cx, cy, r, n };
    if (resized || canvas.width === 0) {
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    }
    if (pts.length !== n * 3) {
      pts = fibonacciSphere(n);
      digs = sphereDigits(n);
      sx = new Float32Array(n);
      sy = new Float32Array(n);
      sBucket = new Uint8Array(n);
      sStep = new Uint8Array(n);
    }
    buildAtlas();
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!atlas || L.n === 0) return;
    const { dpr, cx, cy, r, n } = L;
    const steps = alphas.length;
    for (let i = 0; i < n; i++) {
      projectPoint(
        pts[i * 3],
        pts[i * 3 + 1],
        pts[i * 3 + 2],
        yaw,
        SPHERE_TILT,
        proj
      );
      sx[i] = (cx + proj.x * r) * dpr;
      sy[i] = (cy + proj.y * r) * dpr;
      sStep[i] = depthStep(proj.z, steps);
      sBucket[i] = sizeBucket(glyphSize(proj.scale, r), gMin, gMax, BUCKETS);
    }
    for (let s = 0; s < steps; s++) {
      g.globalAlpha = alphas[s];
      for (let i = 0; i < n; i++) {
        if (sStep[i] !== s) continue;
        const b = sBucket[i];
        const w = cellW[b];
        const h = cellH[b];
        g.drawImage(
          atlas,
          digs[i] * w,
          rowY[b],
          w,
          h,
          sx[i] - w / 2,
          sy[i] - h / 2,
          w,
          h
        );
      }
    }
    g.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = 0;
    if (reduced || !onScreen || doc.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    yaw += (dt * Math.PI * 2) / SPHERE_TURN_SECONDS;
    draw();
    raf = win.requestAnimationFrame(frame);
  }

  function kick() {
    if (reduced) {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      yaw = STILL_YAW;
      draw();
      return;
    }
    if (!raf && onScreen && !doc.hidden) {
      last = 0;
      raf = win.requestAnimationFrame(frame);
    }
  }

  const onVisibility = () => kick();
  doc.addEventListener("visibilitychange", onVisibility);

  let io: IntersectionObserver | null = null;
  if (typeof win.IntersectionObserver === "function") {
    io = new win.IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      onScreen = e.isIntersecting;
      if (onScreen) kick();
    });
    io.observe(canvas);
  }

  let ro: ResizeObserver | null = null;
  const onResize = () => {
    layout();
    if (reduced) draw();
  };
  if (typeof win.ResizeObserver === "function") {
    ro = new win.ResizeObserver(onResize);
    ro.observe(canvas);
  } else {
    win.addEventListener("resize", onResize);
  }

  // The theme (a data-theme flip on an ancestor) changes the ink.
  let mo: MutationObserver | null = null;
  const themed = canvas.closest("[data-theme]");
  if (themed && typeof win.MutationObserver === "function") {
    mo = new win.MutationObserver(() => {
      layout();
      if (reduced) draw();
    });
    mo.observe(themed, { attributes: true, attributeFilter: ["data-theme"] });
  }

  const mq =
    typeof win.matchMedia === "function"
      ? win.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const onMotion = () => {
    reduced = !!mq?.matches;
    kick();
  };
  if (mq) {
    reduced = reduced || mq.matches;
    mq.addEventListener?.("change", onMotion);
  }

  layout();
  draw();
  kick();

  return {
    stop() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      doc.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      ro?.disconnect();
      mo?.disconnect();
      if (!ro) win.removeEventListener("resize", onResize);
      mq?.removeEventListener?.("change", onMotion);
    },
    refresh() {
      layout();
      draw();
    },
  };
}
