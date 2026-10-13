/* SCENES — Needt's "special screen" world: the PRINTED SKY (07.10.26 v3).
   A calm, muted, Craft-like sky drawn on <canvas>: a light greyed-blue
   gradient, crisp billowy cumulus (density field at 1/4 res, edge resolved
   at 1/2 res with a smoothstep and a fine detail octave, lit from above with
   a faint cool belly), cloud edges and the left/right sides that dissolve
   into a printed halftone dot screen (CSS-pixel dot canvas), and a static
   paper grain over everything. Clouds drift at a visible, calm pace
   (pxDriftSpeed: W/110 px/s, 5–14; cloud-sea banks in parallax) and breathe;
   near the cursor they thin a little.

   Horizon (prop `horizon`, debug window.__skyHorizon(name|null)):
     "cloudsea" (default) — above the clouds: a dense sea of round, lit cloud
                 tops along the bottom quarter (five banks in parallax), edges
                 dissolving into dots;
     "haze"     — pale atmosphere fading to near-white, faint layered ridges;
     "none"     — sky only (small cards).
   v7 (08.10.26, owner: "bring back the old sky — not blue"): the Oct 7 look
   again — no hills, the old cloud sea — in the lavender family.
   Clouds (prop `clouds`, debug window.__skyClouds(name|null)): "wispy"
   (default) — realistic streaky cumulus from domain-warped noise; "puff" —
   round metaball cumulus with flat bases. `meadow={false}` maps to "none",
                 any other `meadow` to the default.

   Mood: one per DAY (seeded by the local date) per theme family — light:
   lavender (muted lavender-periwinkle, the default look), rose (a touch
   pinker), periwinkle (a touch bluer), all warming to pearl at the horizon;
   dark: night (deep muted indigo-lavender, faint stars), dusk (its violet-
   horizon variant). Tokens --sky-{lavender,rose,periwinkle,night,dusk}-*;
   older names (day, mist, evening, lilac …) are aliases. Debug:
   window.__skyMood(n) shifts the day by n, __skyMood("rose") pins one,
   __skyMood(null) resets.

   Text straight on the sky is dark ink in light moods and white in dark
   ones (--px-ink / -2 / -3, --px-halo, --px-shadow), ≥4.5:1 on every mood.
   Elements marked data-px-calm push clouds away behind them.

   API
     <PxSky variant="a|b|c|d" intensity={1} interactive={true} horizon="cloudsea|haze|none" clouds="wispy|puff"
            scene="promo" meadow (alias) radius={0} mood dark parked engine className style>{children}</PxSky>
       mood   pins a mood name for this sky (e.g. the phone's time of day);
       dark   overrides the theme read from the nearest .dark ancestor;
       parked no frames while true (a closed / dragged layer; last frame stays);
       fps    a lower frame rate for an accent sky (the phone's: 15);
       engine a ref that receives { set(mood, dark), park(v), stop() }.
       The brush (clouds thin around the pointer) follows the mouse and, on
       touch, the finger: pointerdown → touchmove → fades on pointerup /
       touchend / touchcancel; passive listeners, scrolling is never blocked.
       scene="promo" (also automatic inside [data-pw-promo], [data-settings-plan],
       [data-mb-promo], [data-px-promo]): 5 layered clouds with depth, a sun glow
       in the top-right corner; hovering / focus-visible on the host parts and
       brightens them.
     <GlassCard pad radius width caption strong best className style onClick label>
     <PxBadge tone="solid|glass|green">Pro</PxBadge>
     <PxDots count index onPick label />

   Performance (08.10.26 v2, owner: "the app lags" — Connections was ~20 ms
   per frame at 30 fps, auth ~30, with 50–350 ms spikes):
     · field at 1/4 res (kc), edges at 1/2 res, dots at CSS px — unchanged;
       the smooth noise terms (warp, both banks' base octaves, fringe width)
       on a lattice every 2–4 cells, interpolated; billow octaves per cell;
     · fine pass visits only cloud quads and cloud-sea columns over a copy of
       the static base; sea bodies and cloud interiors read colour tables;
     · full skies (> 500k px) run at 20 fps, alternating a field frame
       (cloud field + sea + repaint) and a dot frame (the field slid by the
       drift, cloud pixels only, dots); small skies 24 fps (a sub-pixel step
       at the slow drift); pointer in the sky: 30 / display rate;
     · rest: no input on the page for 12 s (one shared detector, pxRest) →
       the drift eases to 0 over 1.5 s and the sky stops scheduling frames
       (last frame stays); any input eases it back up over 0.8 s — the
       speed is eased, the position (pos) and clock (ta) never jump;
     · dots: each 4×4 cell keeps a key, only changed cells are restamped and
       only their bounding rect is uploaded;
     · paused when the tab is hidden, the sky is off-screen, or an opaque
       element covers it (5-point check, 1/s); one still frame under
       prefers-reduced-motion, redrawn only when words/palette change;
     · rebuilds (resize, new mood) are coalesced
       and run in idle time; easing is per second, not per frame;
     · no per-frame allocations; colours packed into Int32 views.
   Debug: window.__pxStats {frames, ms, max}; window.__pxBench(n) draws every
   live sky n times back to back and returns ms per draw; window.__pxProf = {}
   collects per-stage ms for full skies. */

/* ── Value noise ─────────────────────────────────────────────────────── */
const PX_PERM = new Uint8Array(512);
const PX_VAL = new Float32Array(256);
(function pxSeedNoise() {
  let s = 1234567;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const p = []; for (let i = 0; i < 256; i++) { p.push(i); PX_VAL[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PX_PERM[i] = p[i & 255];
})();
/* The lattice values V[P[P[X] + Y]] flattened into one 257×257 table (the
   extra row / column repeats the first, as P wraps), so a sample is four
   plain reads. Same values as the two-level lookup. */
const PX_GRID = (function () {
  const g = new Float32Array(257 * 257);
  for (let X = 0; X < 257; X++) for (let Y = 0; Y < 257; Y++) g[X * 257 + Y] = PX_VAL[PX_PERM[PX_PERM[X & 255] + (Y & 255)]];
  return g;
})();
function pxNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const i = (xi & 255) * 257 + (yi & 255), G = PX_GRID;
  const a = G[i], b = G[i + 257], c = G[i + 1], d = G[i + 258];
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/* One axis of pxNoise for samples p = k * step + off (k = 0 … n-1): lattice
   index (× stride) and smoothstep weight, so a 2-D sample is four reads. */
function pxNoiseAxis(idx, wt, n, step, off, stride) {
  for (let k = 0; k < n; k++) {
    const p = k * step + off, pi = Math.floor(p), f = p - pi;
    idx[k] = (pi & 255) * stride; wt[k] = f * f * (3 - 2 * f);
  }
}
function pxHash(a, b, c) { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); }

/* ── Moods ───────────────────────────────────────────────────────────── */
/* Mood colours are tokens in themes.css (--sky-*), read once through cssvar.js.
   A page without themes.css / cssvar.js gets a flat grey sky instead of a crash. */
const pxTok = (n) => (window.cssVar ? window.cssVar(n) : "");
const pxHex = (h) => { if (!h || h.charAt(0) !== "#") return [128, 128, 128]; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/* top / mid / low: the sky gradient (low = the horizon). sun: a soft glow,
   sunA its strength. lit / shade: cloud tops and bellies. dot: the halftone
   ink. ridge: the haze horizon's distant hills. */
const pxMoodTok = (k, extra) => Object.assign({
  top: pxTok('--sky-' + k + '-top'), mid: pxTok('--sky-' + k + '-mid'), low: pxTok('--sky-' + k + '-low'), sun: pxTok('--sky-' + k + '-sun'),
  lit: pxTok('--sky-' + k + '-lit'), shade: pxTok('--sky-' + k + '-shade'), dot: pxTok('--sky-' + k + '-dot'), ridge: pxTok('--sky-' + k + '-ridge') }, extra);
/* v7 (08.10.26, owner: "Lavender + light daily variations"): one family,
   muted and painterly. Light: lavender (the Oct 7 screenshot), rose (pinker),
   periwinkle (bluer); dark: night (indigo-lavender) and dusk (violet horizon). */
const PX_MOOD_HEX = {
  lavender:   pxMoodTok("lavender",   { sunA: .25, sunX: .7,  sunY: .12, cover: 0 }),
  rose:       pxMoodTok("rose",       { sunA: .28, sunX: .24, sunY: .14, cover: 0 }),
  periwinkle: pxMoodTok("periwinkle", { sunA: .22, sunX: .8,  sunY: .08, cover: 0 }),
  night:      pxMoodTok("night",      { sunA: .1,  sunX: .78, sunY: .14, cover: -.03, stars: 1 }),
  dusk:       pxMoodTok("dusk",       { sunA: .12, sunX: .24, sunY: .7,  cover: -.02, stars: 1 })
};
/* Old names (pins, backgrounds.html) map onto the v7 set. */
const PX_ALIAS = { lilac: "lavender", mist: "lavender", candy: "rose", sunset: "rose", gold: "rose", golden: "rose",
  day: "periwinkle", clear: "periwinkle", summer: "periwinkle", haze: "periwinkle", silver: "periwinkle", overcast: "periwinkle", aqua: "periwinkle", teal: "periwinkle",
  evening: "night", moonlit: "night", harbor: "night", indigo: "night", slate: "dusk" };
const PX_LIGHT = ["lavender", "lavender", "rose", "periwinkle"];
const PX_DARK = ["night", "night", "dusk"];
const PX_MOOD = {};
Object.keys(PX_MOOD_HEX).forEach((k) => {
  const o = {}; const s = PX_MOOD_HEX[k];
  Object.keys(s).forEach((f) => { o[f] = typeof s[f] === "string" ? pxHex(s[f]) : s[f]; });
  o.name = k; o.night = !!s.stars; PX_MOOD[k] = o;
});
const pxLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const pxSmooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
/* Opaque RGBA packed for an Int32 view (little-endian), rounded and clamped
   (promo light biases can overshoot), as the Uint8ClampedArray writes were.
   Signed on purpose: an opaque colour is then a small integer, never a boxed
   heap number when it is returned from a function. */
const pxPack = (r, g, b) => 0xff000000 | (b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0) << 16 | (g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0) << 8 | (r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0);
const pxCss = (c, a) => a == null ? "rgb(" + c.map(Math.round).join(",") + ")" : "rgba(" + c.map(Math.round).join(",") + "," + a + ")";

/* One mood per local day and theme family. */
let pxMoodPin = null, pxDayShift = 0, pxHorizonPin = null, pxCloudPin = null;
function pxDayKey(date) {
  const d = new Date((date || new Date()).getTime() + pxDayShift * 864e5);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function pxMoodName(date, dark) {
  if (pxMoodPin && PX_MOOD[pxMoodPin] && PX_MOOD[pxMoodPin].night === !!dark) return pxMoodPin;
  const list = dark ? PX_DARK : PX_LIGHT;
  let h = (pxDayKey(date) * 2654435761 + (dark ? 97 : 13)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return list[(h >>> 0) % list.length];
}
function pxPalette(date, dark, pin) {
  const nm = pin && PX_MOOD[PX_ALIAS[pin] || pin] ? (PX_ALIAS[pin] || pin) : pxMoodName(date, dark);
  const m = PX_MOOD[nm];
  return Object.assign({}, m, { dark: !!dark, phase: { a: m.name, b: m.name, k: 0 } });
}
window.__skyMood = function (arg) {
  if (arg == null) { pxMoodPin = null; pxDayShift = 0; }
  else if (typeof arg === "number") { pxMoodPin = null; pxDayShift = arg; }
  else pxMoodPin = PX_ALIAS[arg] || String(arg);
  try { window.dispatchEvent(new Event("px-time")); } catch (e) {}
  return { light: pxMoodName(window.__pxTimeAt || new Date(), false), dark: pxMoodName(window.__pxTimeAt || new Date(), true) };
};
window.__skyClouds = function (c) {
  pxCloudPin = c === "puff" || c === "wispy" ? c : null;
  try { window.dispatchEvent(new Event("px-time")); } catch (e) {}
  return pxCloudPin || "wispy";
};
window.__skyHorizon = function (h) {
  pxHorizonPin = h == null ? null : String(h);
  try { window.dispatchEvent(new Event("px-time")); } catch (e) {}
  return pxHorizonPin || "cloudsea";
};

/* Inherited by everything on the sky. Light moods: dark ink on a pale sky
   (≥6:1 at the deepest top colour); dark moods: white ink. */
function pxApplyVars(el, p) {
  const st = el.style;
  if (p.night) {
    st.setProperty("--px-ink", "var(--sky-on-dark-ink)");
    st.setProperty("--px-ink-2", "var(--sky-on-dark-ink-2)");
    st.setProperty("--px-ink-3", "var(--sky-on-dark-ink-3)");
    st.setProperty("--px-halo", "var(--sky-on-dark-halo)");
    st.setProperty("--px-shadow", "var(--sky-on-dark-shadow)");
    st.setProperty("--px-line", "var(--sky-on-dark-line)");
  } else {
    st.setProperty("--px-ink", "var(--sky-on-light-ink)");
    st.setProperty("--px-ink-2", "var(--sky-on-light-ink-2)");
    st.setProperty("--px-ink-3", "var(--sky-on-light-ink-3)");
    st.setProperty("--px-halo", "var(--sky-on-light-halo)");
    st.setProperty("--px-shadow", "var(--sky-on-light-shadow)");
    st.setProperty("--px-line", "var(--sky-on-light-line)");
  }
  st.setProperty("--px-ground", pxCss(p.mid));
  st.setProperty("--px-tint", pxCss(pxLerp(p.top, p.mid, 0.55)));
  st.setProperty("--px-hue", pxCss(p.mid));
  el.setAttribute("data-px-night", p.night ? "1" : "0");
  el.setAttribute("data-px-mood", p.name);
}

/* Paper grain: one static tile, shared. */
let pxGrainUrl = null;
function pxGrain() {
  if (pxGrainUrl) return pxGrainUrl;
  try {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), im = x.createImageData(128, 128);
    let s = 99;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0); pxGrainUrl = c.toDataURL("image/png");
  } catch (e) { pxGrainUrl = ""; }
  return pxGrainUrl;
}

/* Halftone dot stamps: NL sizes, antialiased by 4×4 supersampling. Each
   stamp is [dx, dy, coverage, …]. Dot area grows with the weight. */
const PX_PITCH = 4, PX_NL = 12;
const PX_STAMPS = (function () {
  const out = [], rmax = PX_PITCH * 0.47, c = PX_PITCH / 2;
  for (let l = 0; l < PX_NL; l++) {
    const r = Math.max(0.42, rmax * Math.sqrt((l + 1) / PX_NL)), st = [];
    for (let y = 0; y < PX_PITCH; y++) for (let x = 0; x < PX_PITCH; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dx = x + (sx + .5) / 4 - c, dy = y + (sy + .5) / 4 - c;
        if (dx * dx + dy * dy <= r * r) n++;
      }
      if (n) st.push(x, y, n / 16);
    }
    out.push(st);
  }
  return out;
})();

/* ── The renderer ────────────────────────────────────────────────────── */
/* Cloud-sea banks, far to near: [base (0–1 of height), vertical squash of
   the round puffs, puff period px, drift as a share of the main clouds'
   speed (parallax: far slow, near fast), haze toward the horizon]. */
const PX_SEA = [[0.79, 0.32, 70, 0.12, 0.5], [0.83, 0.36, 110, 0.2, 0.34], [0.88, 0.42, 170, 0.31, 0.2], [0.94, 0.48, 250, 0.46, 0.09], [1.02, 0.55, 360, 0.66, 0]];
/* Drift (07.10.26 v4, owner: "noticeable but calm"): the main clouds travel
   W/110 px/s, clamped to 5–14 — a 1440 screen is crossed in ~2 min, a
   300px promo card moves 5 px/s so it never looks frantic. Shapes breathe
   at PX_MORPH× the old rate. Position is integrated per frame, so pausing
   (off-screen, hidden tab) resumes where it stopped and resizes don't jump. */
const PX_NS = 5;
const pxDriftSpeed = (W) => Math.max(5, Math.min(14, W / 110));
const PX_MORPH = 2.2;
/* Promo cards: a composed little sky — far hazy clouds, a bright foreground
   cloud, a sun glow in the top-right corner. The composition keeps the
   words clear, so here the clouds sway instead of wrapping: ±(6–11)% of the
   width on a 40–60 s cycle, nearer ones further and faster (≈2–5 px/s at
   the peak on a 280px card), plus the same breathing. [x (0–1 of width), base y (0–1
   of height), width (× height), depth 0 far … 1 near]. */
const PX_PROMO = [[0.57, 0.44, 0.56, 0], [0.8, 0.32, 0.46, 0.15], [0.94, 0.64, 0.52, 0.35], [0.7, 0.84, 0.8, 0.55], [0.95, 1.14, 1.35, 1]];
const PX_PROMO_SEL = "[data-px-promo],[data-pw-promo],[data-settings-plan],[data-mb-promo]";
/* Second cloud bank: noise-space offset (x, y) and a small bias that keeps
   the union from crowding the sky — 2–4 clouds on a wide screen. */
const PX_BANK2 = [37.3, 21.9, 0.02];
const PX_SEEDS = { a: [3.1, 7.7, 1], b: [41.3, 12.9, -1], c: [19.5, 88.2, 1], d: [63.7, 31.4, -1] };
const pxLive = new Set();
window.__pxBench = (n) => Array.from(pxLive).filter((e) => e.root.isConnected).map((e) => e.bench(n || 30));
window.__pxState = () => Array.from(pxLive).filter((e) => e.root.isConnected).map((e) => e.state());
const pxStats = window.__pxStats || { frames: 0, ms: 0, max: 0, reset() { this.frames = 0; this.ms = 0; this.max = 0; } };
window.__pxStats = pxStats;
/* Rest (08.10.26, owner: "if it doesn't cost much, make it lighter at rest"):
   one shared idle detector for every sky. No pointer / key / wheel / touch
   input for PX_REST_MS → pxRest.idle; each sky then eases its drift to
   0 (~1.5 s) and stops scheduling frames, the last frame stays painted. The
   next input (or the tab coming back) wakes every sky; drift eases back up
   (~0.8 s). Listeners are passive; the timer re-arms itself only when it
   fires, so input costs one timestamp write. */
const PX_REST_MS = 12000;
const pxRest = { idle: false, last: performance.now(), subs: new Set(), timer: 0 };
(function pxRestInit() {
  const arm = (ms) => { pxRest.timer = window.setTimeout(check, ms); };
  function check() {
    pxRest.timer = 0;
    const left = PX_REST_MS - (performance.now() - pxRest.last);
    if (left > 0) { arm(left + 50); return; }
    pxRest.idle = true;
    pxRest.subs.forEach((f) => f(true));
  }
  const wake = () => {
    pxRest.last = performance.now();
    if (!pxRest.idle) return;
    pxRest.idle = false;
    if (!pxRest.timer) arm(PX_REST_MS + 50);
    pxRest.subs.forEach((f) => f(false));
  };
  const o = { passive: true, capture: true };
  /* Not "scroll": the app scrolls by itself (scrollIntoView, chat streaming);
     a person's scroll always starts with wheel / touch / key / pointerdown
     (scrollbar). A programmatic scroll still re-reads the calm rects in each
     sky (onScroll) and eases them without waking the drift. */
  ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((n) => window.addEventListener(n, wake, o));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); }, { passive: true });
  arm(PX_REST_MS + 50);
})();
window.__pxRest = pxRest;
function pxHorizonOf(opt) {
  if (opt.horizon) return opt.horizon;
  if (opt.meadow === false) return "none";
  if (typeof opt.meadow === "string") return opt.meadow;
  return "cloudsea";
}

function pxStart(root, canvas, dotCanvas, opt) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const dctx = dotCanvas.getContext("2d");
  const scope = root.closest("[data-px-scope]") || root;
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduced = !!(mq && mq.matches);
  let img = null, W = 0, H = 0, kc = 4, cols = 0, rows = 0, gc = 0, gr = 0;
  let pal = null, palSig = "", lastPal = 0;
  let base = null, calmMap = null, ridgeTop = null, stars = [];
  let DW = null, DL = null, FB = null, FA = null, FL = null;
  let F = null, LB = null, FW = null, MB = null, PL = null, od = null, seaTopBuf = null, seaEdge = null, seaE = null, clouds = null, cloudPad = 0, AL = null, base32 = null, seaFw = null;
  let dimg = null, d32 = null, dW = 0, dH = 0, ncx = 0, ncy = 0, side = null;
  /* Perf (08.10.26): low-frequency lattice (every LQ coarse cells) for the
     smooth noise terms, interpolated per cell; per-bank puff caches for the
     cloud sea; reusable buffers so a frame allocates nothing. */
  let LQ = 2, lc = 0, lr = 0, LW = null, L1 = null, L2 = null, LP = null, rwW = null, rw1 = null, rw2 = null, rwP = null, lxi = null, ltx = null;
  let seaCx = null, seaRr = null, seaCx2 = null, seaRr2 = null, D32 = null, aLut = new Int32Array(33), aLutSig = "";
  let cellKey = null, stampOff = null, stampV = null, stampW = 0, dotsReset = true, dX0 = 0, dY0 = 0, dX1 = 0, dY1 = 0;
  let nXi = null, nXu = null, nXi2 = null, nXu2 = null, nYi = null, nYv = null, nYi2 = null, nYv2 = null;
  let liC = null, cloudList = null, cloudN = 0, starV = null;
  const cloudLut = new Int32Array(256); let cloudLutSig = "";
  const seaInvBuf = new Float32Array(PX_SEA.length), seaLut = new Int32Array(PX_SEA.length * 128); let seaLutSig = "";
  let frameTick = 0, fieldOk = false, fieldSx = 0, fieldS = 0, xg = null, xt = null, qA = null, qB = null;
  let big = false, frameMs = 33, calmLive = true, covered = false, parked = !!opt.parked;
  const seed = PX_SEEDS[opt.variant] || PX_SEEDS.a;
  const intensity = opt.intensity == null ? 1 : Math.max(0.6, Math.min(1.8, opt.intensity));
  const own = pxHorizonOf(opt);
  let hz = own;
  const ownClouds = opt.clouds === "puff" ? "puff" : "wispy";
  let cm = ownClouds;
  let calm = [];
  const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, amp: 0, on: 0, cx: 0, cy: 0, fresh: false };
  let hidden = document.hidden, inView = true, raf = 0, last = 0, stopped = false;
  const t0 = performance.now() - (seed[0] * 1000) % 20000;
  const little = () => H < 220 || W < 420;
  /* Promo cards: explicit opt.scene, or a PxSky inside a known promo host. */
  const promoHost = opt.scene === "promo" ? (root.closest(PX_PROMO_SEL) || root) : root.closest(PX_PROMO_SEL);
  const promo = !!promoHost;
  let pos = 0, lastT = -1, hov = 0, hovOn = 0;
  /* Rest: fl ramps 0…1 (down over 1.5 s when the page is idle, up over 0.8 s
     on input); the drift and the animation clock ta advance at
     smoothstep(fl) × real time, so stopping and resuming never jump. */
  let fl = pxRest.idle ? 0 : 1, ta = 0;

  function resize() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    /* Internal resolution: finer on small skies, a touch coarser on very
       large ones (the cloud edges dissolve into CSS-pixel dots anyway). */
    kc = H < 220 ? 3 : W * H > 1.1e6 ? 5 : 4;
    const kf = kc / 2;
    cols = Math.max(2, Math.ceil(W / kf)); rows = Math.max(2, Math.ceil(H / kf));
    canvas.width = cols; canvas.height = rows;
    img = ctx.createImageData(cols, rows);
    gc = Math.ceil(cols / 2) + 2; gr = Math.ceil(rows / 2) + 2;
    F = new Float32Array(gc * gr); LB = new Float32Array(gc * gr); FW = new Float32Array(gc * gr); MB = new Float32Array(gc * gr); PL = new Float32Array(gc * gr); AL = new Float32Array(gc * gr).fill(1); DW = new Float32Array(gc * gr); DL = new Float32Array(gc * gr); FB = new Float32Array(gc * gr); FA = new Float32Array(gc * gr); FL = new Float32Array(gc * gr);
    clouds = null;
    od = new Float32Array(gc); seaTopBuf = new Float32Array(cols); seaE = new Float32Array(PX_NS * cols); seaEdge = PX_SEA.map((q, li) => seaE.subarray(li * cols, (li + 1) * cols));
    dW = Math.max(1, Math.ceil(W)); dH = Math.max(1, Math.ceil(H));
    dotCanvas.width = dW; dotCanvas.height = dH;
    dimg = dctx.createImageData(dW, dH); d32 = new Int32Array(dimg.data.buffer);
    ncx = Math.floor(dW / PX_PITCH); ncy = Math.floor(dH / PX_PITCH);
    cellKey = null; seaFw = new Float32Array(PX_SEA.length * ncx);
    base = null; calmMap = null; calmTgt = null; side = null;
    D32 = new Int32Array(img.data.buffer, img.data.byteOffset, cols * rows);
    /* Full skies (> ~500k px) run at 20 fps, small ones at 24; the smooth
       noise lattice is 4 cells apart on full skies, 2 on small ones. */
    big = W * H > 5e5; frameMs = big ? 50 : 42; LQ = big ? 4 : 2;
    /* an accent sky may ask for fewer frames (opt.fps); the brush still runs at display rate */
    if (opt.fps > 0) frameMs = Math.max(frameMs, Math.round(1000 / opt.fps));
    lc = Math.floor((gc - 1) / LQ) + 2; lr = Math.floor((gr - 1) / LQ) + 2;
    LW = new Float32Array(lc * lr); L1 = new Float32Array(lc * lr); L2 = new Float32Array(lc * lr); LP = new Float32Array(lc * lr);
    rwW = new Float32Array(lc); rw1 = new Float32Array(lc); rw2 = new Float32Array(lc); rwP = new Float32Array(lc);
    lxi = new Int32Array(gc); ltx = new Float32Array(gc);
    for (let gx = 0; gx < gc; gx++) { lxi[gx] = (gx / LQ) | 0; ltx[gx] = (gx - lxi[gx] * LQ) / LQ; }
    const nP = Math.ceil(W / 12) + 16;
    seaCx = new Float32Array(nP); seaRr = new Float32Array(nP); seaCx2 = new Float32Array(nP * 3); seaRr2 = new Float32Array(nP * 3);
    fieldOk = false;
    nXi = new Int32Array(cols); nXu = new Float32Array(cols); nXi2 = new Int32Array(cols); nXu2 = new Float32Array(cols);
    nYi = new Int32Array(rows); nYv = new Float32Array(rows); nYi2 = new Int32Array(rows); nYv2 = new Float32Array(rows);
    liC = new Int8Array(cols); cloudList = new Int32Array(cols * rows); cloudN = 0; xg = new Int32Array(cols); xt = new Float32Array(cols); qA = new Int32Array(gc); qB = new Int32Array(gc);
  }
  function readCalm() {
    const r0 = root.getBoundingClientRect();
    calm = [];
    scope.querySelectorAll("[data-px-calm]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) calm.push([(r.left - r0.left) / kc, (r.top - r0.top) / kc, (r.right - r0.left) / kc, (r.bottom - r0.top) / kc]);
    });
    /* Unchanged words: keep the calm target as it is. */
    const sa = calm.map((q) => q.map((v) => Math.round(v * 4)).join(",")).join(";");
    if (sa === calmAllSig && calmTgt && calmTgt.length === gc * gr) return false;
    calmAllSig = sa;
    buildCalm();
    return true;
  }
  /* Calm is eased (08.10.26, owner: clouds vanished/reappeared abruptly while
     scrolling). buildCalm writes the TARGET; draw() eases calmMap toward it,
     so clouds thin out and fill back in over ~0.6 s instead of in one frame. */
  let calmTgt = null;
  function buildCalm() {
    if (!gc) return;
    const fresh = !calmMap || calmMap.length !== gc * gr;
    if (!calmTgt || calmTgt.length !== gc * gr) calmTgt = new Float32Array(gc * gr); else calmTgt.fill(0);
    if (fresh) calmMap = new Float32Array(gc * gr);
    buildCalmInto(calmTgt);
    if (fresh || reduced) calmMap.set(calmTgt);
    calmLive = true;
  }
  function easeCalm(ke) {
    if (!calmLive || !calmMap || !calmTgt || calmMap.length !== calmTgt.length) return;
    const k = reduced ? 1 : ke;
    let moving = false;
    for (let i = 0; i < calmMap.length; i++) { const dv = calmTgt[i] - calmMap[i]; if (dv) { moving = true; calmMap[i] = Math.abs(dv) < 0.002 ? calmTgt[i] : calmMap[i] + dv * k; } }
    calmLive = moving;  /* settled: skip until the next readCalm */
  }
  function buildCalmInto(calmMap) {
    if (!calm.length) return;
    const CP = 64 / kc;
    for (let c = 0; c < calm.length; c++) {
      const q = calm[c];
      const x0 = Math.max(0, Math.floor(q[0] - CP)), x1 = Math.min(gc - 1, Math.ceil(q[2] + CP));
      const y0 = Math.max(0, Math.floor(q[1] - CP)), y1 = Math.min(gr - 1, Math.ceil(q[3] + CP));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ex = x < q[0] ? q[0] - x : x > q[2] ? x - q[2] : 0, ey = y < q[1] ? q[1] - y : y > q[3] ? y - q[3] : 0;
        const dd = Math.sqrt(ex * ex + ey * ey);
        if (dd < CP) { const kk = 1 - dd / CP; const v = kk * kk * (3 - 2 * kk); const o = y * gc + x; if (v > calmMap[o]) calmMap[o] = v; }
      }
    }
  }
  function readPalette(force) {
    const dark = opt.dark != null ? !!opt.dark : !!root.closest(".dark");
    const p = pxPalette(window.__pxTimeAt || new Date(), dark, opt.mood);
    const h = promo || own === "none" ? "none" : (pxHorizonPin || own);
    const c = promo ? "wispy" : (pxCloudPin || ownClouds);
    const sig = p.name + (dark ? "d" : "") + h + c;
    if (sig === palSig && !force) { pend = null; return false; }
    if (force || !pal || !base) { applyPal(p, h, c, sig); base = null; pend = null; return true; }
    /* A new mood / theme mid-run: swap palette and base sky together, when idle. */
    pend = [p, h, c, sig]; schedule();
    return false;
  }
  function applyPal(p, h, c, sig) {
    palSig = sig; pal = p; hz = h; cm = c; fieldOk = false; pxApplyVars(scope, p); if (scope !== root) pxApplyVars(root, p); clouds = null;
  }
  /* Rebuilds (resize, new mood) run once, coalesced,
     in idle time (≤150 ms late) instead of inside an animation frame. */
  let idleId = 0, needResize = false, baseStale = false, pend = null, calmAllSig = "";
  const ric = window.requestIdleCallback ? (f, t) => window.requestIdleCallback(f, { timeout: t || 150 }) : (f, t) => window.setTimeout(f, Math.min(30, t || 30));
  const cic = window.cancelIdleCallback ? (id) => window.cancelIdleCallback(id) : (id) => window.clearTimeout(id);
  function schedule() { if (!idleId && !stopped) idleId = ric(runIdle); }
  function runIdle() {
    idleId = 0;
    if (stopped) return;
    let sized = false;
    if (needResize) {
      needResize = false;
      const r = root.getBoundingClientRect();
      if (Math.max(1, r.width) !== W || Math.max(1, r.height) !== H) { resize(); calmAllSig = ""; readCalm(); sized = true; }
    }
    if (pend) { applyPal(pend[0], pend[1], pend[2], pend[3]); pend = null; baseStale = true; }
    if (baseStale && base) { baseStale = false; buildBase(); }
    if (sized || reduced || !raf) draw(performance.now(), true);
  }
  /* The static sky: gradient, sun glow, horizon (haze + ridges), stars. */
  function buildBase() {
    const P = pal, kf = kc / 2;
    base = new Float32Array(cols * rows * 3);
    ridgeTop = null;
    const hor = hz === "cloudsea" ? 0.8 : hz === "haze" ? 0.86 : 1;
    const low = hz === "none" ? pxLerp(P.mid, P.low, 0.55) : P.low;
    const mist = P.night ? pxLerp(P.low, P.lit, 0.18) : pxLerp(P.low, [255, 255, 255], 0.6);
    const sx = (promo ? 0.94 : P.sunX) * cols, sy = (promo ? 0.02 : P.sunY) * rows, sr = Math.max(cols, rows) * (promo ? 0.42 : 0.45);
    const sunA = promo ? Math.max(0.5, P.sunA * 1.4) : P.sunA;
    /* The glow's Gaussians are separable: exp(-k(dx²+dy²)) = exp(-k dx²)·exp(-k dy²). */
    const gx3 = new Float64Array(cols), gx26 = new Float64Array(cols);
    for (let x = 0; x < cols; x++) { const dx = (x - sx) / sr; gx3[x] = Math.exp(-dx * dx * 3); gx26[x] = Math.exp(-dx * dx * 26); }
    for (let y = 0; y < rows; y++) {
      const yn = y / rows, yh = yn / hor;
      let c = yh < 1 ? pxLerp(P.top, P.mid, pxSmooth(yh / 0.6) * 0.85 + yh / 0.6 * 0.15) : low;
      if (yh < 1 && yh >= 0.6) c = pxLerp(P.mid, low, pxSmooth((yh - 0.6) / 0.4));
      if (yh < 0.6) c = pxLerp(P.top, P.mid, pxSmooth(yh / 0.6));
      if (hz === "haze" && yn > 0.7) c = pxLerp(c, mist, pxSmooth((yn - 0.7) / 0.3) * 0.85);
      const dy = (y - sy) / sr, gy3 = Math.exp(-dy * dy * 3) * 0.8, gy26 = Math.exp(-dy * dy * 26) * 0.4;
      for (let x = 0; x < cols; x++) {
        const g = Math.min(1, sunA * (gx3[x] * gy3 + gx26[x] * gy26));
        const o = (y * cols + x) * 3;
        base[o] = c[0] + (P.sun[0] - c[0]) * g;
        base[o + 1] = c[1] + (P.sun[1] - c[1]) * g;
        base[o + 2] = c[2] + (P.sun[2] - c[2]) * g;
      }
    }
    if (hz === "haze") {
      /* Three distant ridges, far to near, each a touch deeper; mist pools at their feet. */
      ridgeTop = new Float32Array(cols).fill(rows);
      const L = [[0.79, 0.05, 0.3, 11], [0.85, 0.045, 0.42, 23], [0.91, 0.04, 0.56, 37]];
      for (let li = 0; li < L.length; li++) {
        const [b0, amp, strength, sd] = L[li];
        const rc = pxLerp(mist, P.ridge, strength * (P.night ? 1.6 : 1));
        for (let x = 0; x < cols; x++) {
          const u = x * kf / Math.max(300, W * 0.55);
          const n = pxNoise(u * 2.2 + sd + seed[1], 1.7) * 0.7 + pxNoise(u * 6.1 + sd * 2, 4.1) * 0.3;
          const hy = rows * (b0 - amp * (n * 1.6 - 0.3));
          if (hy < ridgeTop[x]) ridgeTop[x] = hy;
          for (let y = Math.max(0, Math.floor(hy)); y < rows; y++) {
            const a = Math.min(1, y - hy + 0.5);
            if (a <= 0) continue;
            const fog = pxSmooth((y - hy) / (rows * 0.07));
            const cc = pxLerp(rc, mist, fog * 0.55);
            const o = (y * cols + x) * 3;
            base[o] += (cc[0] - base[o]) * a; base[o + 1] += (cc[1] - base[o + 1]) * a; base[o + 2] += (cc[2] - base[o + 2]) * a;
          }
        }
      }
    }
    dotsReset = true;  /* colours changed: restamp every dot cell */
    /* Packed copy for the fast clear-sky path of the fine pass. */
    base32 = new Int32Array(cols * rows);
    for (let i = 0, o = 0; i < base32.length; i++, o += 3) {
      const rr = base[o] < 0 ? 0 : base[o] > 255 ? 255 : base[o] + 0.5, gg = base[o + 1] < 0 ? 0 : base[o + 1] > 255 ? 255 : base[o + 1] + 0.5, bb = base[o + 2] < 0 ? 0 : base[o + 2] > 255 ? 255 : base[o + 2] + 0.5;
      base32[i] = 255 << 24 | (bb & 255) << 16 | (gg & 255) << 8 | (rr & 255);
    }
    stars = []; fieldOk = false;  /* repaint everything on the next frame */
    if (P.night) {
      const n = Math.round(cols * rows / 3200);  /* all in the top 55% */
      for (let i = 0; i < n; i++) {
        const x = Math.floor(pxHash(i, seed[0], 1) * cols), y = Math.floor(Math.pow(pxHash(i, seed[1], 2), 1.5) * rows * 0.55);
        stars.push(x, y, 0.25 + pxHash(i, 3, 3) * 0.45, pxHash(i, 4, 4) * 6.28, 0.4 + pxHash(i, 5, 5) * 1.2);
      }
    }
    starV = new Int32Array(stars.length / 5);
  }
  /* A handful of cumulus, each a dome of puffs on a flat base, spread
     across the sky above the horizon; deterministic per variant. */
  function makeCloud(i, w, h, x, y, sp, depth) {
    const p = [];
    const np = (promo ? 12 : 9) + Math.floor(pxHash(i + seed[0] * 3, 4, seed[1]) * 6);
    for (let j = 0; j < np; j++) {
      const u = (j + 0.5) / np + (pxHash(i, j, 5) - 0.5) * 0.12;
      const dome = Math.pow(Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), 0.8);
      const pr = w * (0.1 + 0.13 * dome * (0.5 + 0.7 * pxHash(i, j, 6)));
      p.push((u - 0.5) * w * 0.8, -pr * 0.45 - dome * h * 0.42 * (0.5 + 0.5 * pxHash(i, j, 7)), pr, pxHash(i, j, 8) * 6.28);
    }
    for (let j = 0, nt = promo ? 7 : 4; j < nt; j++) {  /* a few small top puffs */
      const u = 0.3 + 0.4 * pxHash(i, j, 9), pr = w * (0.09 + 0.05 * pxHash(i, j, 10));
      p.push((u - 0.5) * w * 0.7, -h * (0.5 + 0.12 * pxHash(i, j, 11)), pr, pxHash(i, j, 12) * 6.28);
    }
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (let j = 0; j < p.length; j += 4) { const rr = p[j + 2] * 1.1; x0 = Math.min(x0, p[j] - rr); x1 = Math.max(x1, p[j] + rr); y0 = Math.min(y0, p[j + 1] - rr); y1 = Math.max(y1, p[j + 1] + rr); }
    cloudPad = Math.max(cloudPad, Math.max(-x0, x1) + 20);
    /* depth: 0 far (hazy, see-through, slow) … 1 near (bright, opaque, fast). */
    return { x, y, w, h, p, x0, x1, y0, y1, sp, depth, a: 0.5 + 0.5 * depth, lb: -0.06 + 0.14 * depth };
  }
  /* A handful of cumulus, each a dome of puffs on a flat base, spread
     across the sky above the horizon; deterministic per variant. */
  function buildClouds() {
    clouds = []; cloudPad = 0;
    if (promo) {
      for (let i = 0; i < PX_PROMO.length; i++) {
        const q = PX_PROMO[i], w = q[2] * H, h = w * (0.46 + 0.1 * pxHash(i, 2, seed[1]));
        clouds.push(makeCloud(i, w, h, q[0] * W, q[1] * H, 0.4 + 0.6 * q[3], q[3]));
      }
      clouds.forEach((c) => { c.x += cloudPad; });
      return;
    }
    const sc = Math.max(0.32, Math.min(1.15, H / 760));
    const top = hz === "none" ? 0.95 : hz === "haze" ? 0.66 : 0.62;
    const n = Math.max(2, Math.min(7, Math.round(W / (little() ? 170 : 300))));
    for (let i = 0; i < n; i++) {
      const r = (k) => pxHash(i + seed[0] * 3, k, seed[1]);
      const w = (190 + 260 * r(1)) * sc, h = w * (0.42 + 0.14 * r(2));
      const y = H * (0.14 + (top - 0.22) * ((i * 0.618 + r(3) * 0.35) % 1)) + h * 0.5;
      const c = makeCloud(i, w, h, 0, y, 0.75 + 0.5 * r(14), 1);
      c.a = 1; c.lb = 0;
      clouds.push(c);
    }
    clouds.forEach((c, i) => { c.x = (i + 0.5 + (pxHash(i + seed[0] * 3, 13, seed[1]) - 0.5) * 0.6) / n * (W + c.w); });
  }
  /* Static dot screen on the left/right sides, patchy like distant cloud. */
  function buildSide() {
    side = new Float32Array(ncx * ncy);
    const span = Math.max(120, W * 0.2), k = little() ? 0.35 : 1;
    for (let cy = 0; cy < ncy; cy++) for (let cx = 0; cx < ncx; cx++) {
      const px = cx * PX_PITCH + 2, py = cy * PX_PITCH + 2;
      const e = Math.min(px, W - px) / span;
      if (e >= 1) continue;
      const ramp = (1 - e) * (1 - e);
      const patch = pxSmooth((pxNoise(px / 130 + seed[0], py / 130 + seed[1]) * 0.75 + pxNoise(px / 40 + 9, py / 40 + 3) * 0.25 - 0.42) / 0.35);
      side[cy * ncx + cx] = ramp * patch * 0.5 * k;
    }
  }

  /* Metaball clouds into MB (density), PL (top light), and for promo depth:
     back layer DW/AL/DL (weighted opacity / light bias), front layer FB/FA/FL. */
  function accumClouds(tm, dir, t) {
    if (!clouds) buildClouds();
    MB.fill(0); PL.fill(0); AL.fill(0); DW.fill(0); DL.fill(0); FB.fill(0); FA.fill(0); FL.fill(0);
    const span = W + cloudPad * 2;
    for (let ci = 0; ci < clouds.length; ci++) {
      const c = clouds[ci];
      let ox = promo
        ? c.x - cloudPad + dir * W * (0.06 + 0.05 * c.depth) * Math.sin(t * 6.283 / (60 - 20 * c.depth) + ci * 1.9)
        : ((c.x + dir * pos * c.sp) % span + span) % span - cloudPad;
      /* Promo hover: the clouds make way — each slides off the words on the
         left, nearer ones further — and the foreground lifts a little. */
      const lift = promo ? hov * (2 + 4 * c.depth) : 0;
      if (promo && hov > 0.001) ox += hov * (6 + 14 * c.depth);
      const cy0 = c.y - lift;
      const wDepth = 1 + 5 * c.depth, front = promo && c.depth >= 0.5;
      const bx0 = Math.max(0, Math.floor((ox + c.x0) / kc)), bx1 = Math.min(gc - 1, Math.ceil((ox + c.x1) / kc));
      const by0 = Math.max(0, Math.floor((cy0 + c.y0) / kc)), by1 = Math.min(gr - 1, Math.ceil((cy0 + c.y1) / kc));
      if (bx0 > bx1 || by0 > by1) continue;
      const floorY = cy0 - c.h * (promo ? 0.12 : 0.05), floorH = c.h * (promo ? 0.42 : 0.22);
      for (let pi = 0; pi < c.p.length; pi += 4) {
        /* Breathing: each puff swells and settles on its own slow phase. */
        const pr = c.p[pi + 2] * (1 + 0.07 * Math.sin(tm * 0.11 + c.p[pi + 3]) + 0.03 * Math.sin(tm * 0.047 + c.p[pi + 3] * 2.3)), pr2 = pr * pr;
        const pcx = ox + c.p[pi], pcy = cy0 + c.p[pi + 1];
        const x0 = Math.max(bx0, Math.floor((pcx - pr) / kc)), x1 = Math.min(bx1, Math.ceil((pcx + pr) / kc));
        const y0 = Math.max(by0, Math.floor((pcy - pr) / kc)), y1 = Math.min(by1, Math.ceil((pcy + pr) / kc));
        for (let gy = y0; gy <= y1; gy++) {
          const dy = gy * kc - pcy, dy2 = dy * dy, row = gy * gc;
          const keep = 1 - 0.92 * pxSmooth((gy * kc - floorY) / floorH);  /* flat base */
          if (keep <= 0.08) continue;
          for (let gx = x0; gx <= x1; gx++) {
            const dx = gx * kc - pcx, q = (dx * dx + dy2) / pr2;
            if (q < 1) {
              const v = 1 - q, vv = v * v * keep, o = row + gx;
              MB[o] += vv; PL[o] -= vv * dy / pr;
              if (front) { FB[o] += vv; FA[o] += vv * c.a; FL[o] += vv * c.lb; }
              else { const wv = vv * wDepth; DW[o] += wv; AL[o] += wv * c.a; DL[o] += wv * c.lb; }
            }
          }
        }
      }
    }
  }
  /* Promo depth at cell o: sets AL[o], returns the light bias. Inside a
     foreground cloud its own light/opacity win; just outside its rim the
     cloud behind gets a soft contact shadow, so the layers read as separate
     clouds instead of one merged blob. */
  function depthAt(o) {
    const dwv = DW[o], fb = FB[o];
    let lbias = dwv > 0 ? DL[o] / dwv : 0, al = dwv > 0 ? AL[o] / dwv : 1;
    if (fb > 0.001) {
      const fa = FA[o] / fb, fl = FL[o] / fb;
      const k = dwv > 0 ? pxSmooth((fb - 0.36) / 0.1) : 1;
      lbias = lbias + (fl - lbias) * k; al = al + (fa - al) * k;
      if (dwv > 0 && k < 1) lbias -= 0.16 * pxSmooth((fb - 0.12) / 0.22) * (1 - k);
    }
    AL[o] = al;
    return lbias;
  }

  /* One fine pixel that a cloud or the cloud sea can reach (anything else is
     the static base sky). A stable function reading this frame's values from
     the f* variables, so it stays optimised across frames. */
  let fSea = null, fFast = false, fThIn = 0, fSh = null, fLit = null, fLo = null, fT = 0, fE = 0, fDsc = 0, fDvs = 0, fDox = 0, fDoy = 0;
  function px(x, y) {
        const o = y * cols + x, gy0 = y >> 1, ty = (y & 1) * 0.5, gx0 = xg[x];
        const i00 = gy0 * gc + gx0, i10 = i00 + 1, i01 = i00 + gc, i11 = i01 + 1;
        const st = fSea ? fSea[x] : 1e9;
        if (fFast && y <= st) {
          /* Deep inside a cloud (opaque, full sky): the edge terms are all 1,
             the colour depends on the light alone. */
          const tx = xt[x], fa = F[i00] + (F[i10] - F[i00]) * tx, fb = F[i01] + (F[i11] - F[i01]) * tx, f = fa + (fb - fa) * ty;
          if (f > fThIn) {
            const la = LB[i00] + (LB[i10] - LB[i00]) * tx, lb = LB[i01] + (LB[i11] - LB[i01]) * tx;
            return cloudLut[((la + (lb - la) * ty) * 255 + 0.5) | 0];
          }
        }
        const o3 = o * 3;
        let r = base[o3], g = base[o3 + 1], b = base[o3 + 2];
        if (fSea && y >= fSea[x] + 1.5) {
          /* Nearest bank whose top is above this pixel. */
          let li = PX_NS - 1;
          while (li > 0 && y < seaE[(li) * cols + x]) li--;
          const Ly = PX_SEA[li], dy = (y - seaE[(li) * cols + x]) * seaInvBuf[li];
          const L = dy >= 1 ? 0.5 : dy <= 0 ? 1 : 1 - dy * dy * (3 - 2 * dy) * 0.5;
          let cr = fSh[0] + (fLit[0] - fSh[0]) * L, cg = fSh[1] + (fLit[1] - fSh[1]) * L, cb = fSh[2] + (fLit[2] - fSh[2]) * L;
          const hv = Ly[4];
          cr += (fLo[0] - cr) * hv; cg += (fLo[1] - cg) * hv; cb += (fLo[2] - cb) * hv;
          /* 1px antialias against the bank behind (or the sky). */
          const ea = y - seaE[(li) * cols + x];
          if (ea < 1) {
            const k = ea < 0 ? 0 : ea;
            let br = r, bg = g, bb = b;
            if (li > 0 && y >= seaE[(li - 1) * cols + x] ) { const P2 = PX_SEA[li - 1]; const d2 = (y - seaE[(li - 1) * cols + x]) * seaInvBuf[li - 1]; const L2 = 1 - pxSmooth(d2) * 0.5;
              br = fSh[0] + (fLit[0] - fSh[0]) * L2; bg = fSh[1] + (fLit[1] - fSh[1]) * L2; bb = fSh[2] + (fLit[2] - fSh[2]) * L2;
              br += (fLo[0] - br) * P2[4]; bg += (fLo[1] - bg) * P2[4]; bb += (fLo[2] - bb) * P2[4]; }
            cr = br + (cr - br) * k; cg = bg + (cg - bg) * k; cb = bb + (cb - bb) * k;
          }
          return pxPack(cr, cg, cb);
        }
        const tx = xt[x];
        const fa = F[i00] + (F[i10] - F[i00]) * tx, fb = F[i01] + (F[i11] - F[i01]) * tx;
        let f = fa + (fb - fa) * ty;
        if (f > fT - 0.03) {
          if (f < fT + 0.05) {
            /* Edge detail: two value-noise octaves, their lattice cells and
               smoothstep weights tabulated per column / row this frame
               (nX*, nY*) — the same numbers pxNoise gives, without the calls. */
            const G = PX_GRID;
            let i = nXi[x] + nYi[y], u = nXu[x], v = nYv[y], a = G[i], b = G[i + 257], c = G[i + 1], d = G[i + 258];
            const n1 = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
            i = nXi2[x] + nYi2[y]; u = nXu2[x]; v = nYv2[y]; a = G[i]; b = G[i + 257]; c = G[i + 1]; d = G[i + 258];
            const n2 = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
            f += 0.04 * (n1 - 0.5) + 0.012 * (n2 - 0.5);
          }
          const wa = FW[i00] + (FW[i10] - FW[i00]) * tx, wb = FW[i01] + (FW[i11] - FW[i01]) * tx;
          const soft = Math.max(0, (wa + (wb - wa) * ty) - 0.05) * 0.55;
          const dn = pxSmooth((f - fT + fE) / (2 * fE + soft));
          if (dn > 0) {
            const la = LB[i00] + (LB[i10] - LB[i00]) * tx, lb = LB[i01] + (LB[i11] - LB[i01]) * tx;
            const L = la + (lb - la) * ty;
            let dk = dn;
            if (!fFast) { const aa = AL[i00] + (AL[i10] - AL[i00]) * tx, ab = AL[i01] + (AL[i11] - AL[i01]) * tx; dk *= (aa + (ab - aa) * ty); }
            const cr = fSh[0] + (fLit[0] - fSh[0]) * L, cg = fSh[1] + (fLit[1] - fSh[1]) * L, cb = fSh[2] + (fLit[2] - fSh[2]) * L;
            r += (cr - r) * dk; g += (cg - g) * dk; b += (cb - b) * dk;
          }
        }
        if (fSea && y > fSea[x]) { const k = Math.min(1, y - fSea[x]); /* top bank's own antialias row */
          let li = 0; for (let j = 1; j < PX_NS; j++) if (seaE[(j) * cols + x] < seaE[(li) * cols + x]) li = j;
          const hv = PX_SEA[li][4]; let cr = fLit[0] + (fLo[0] - fLit[0]) * hv, cg = fLit[1] + (fLo[1] - fLit[1]) * hv, cb = fLit[2] + (fLo[2] - fLit[2]) * hv;
          r += (cr - r) * k; g += (cg - g) * k; b += (cb - b) * k; }
        return pxPack(r, g, b);
  }
  /* The per-cell part of the wispy coarse pass, its own function so the
     noise calls inline (draw() is too big for that); per-frame inputs in c*. */
  let cT = 0, cTw = 0, cS = 0, cSx = 0, cSy = 0, cTm = 0, cMAmp = 0, cR = 0, cR2 = 0, cHaze = false, cSea = false, cDecay = 0, cOdk = 0, cSpan = 0, cB0 = 0, cB1 = 0;
  function coarseWispy() {
    for (let gy = 0; gy < gr; gy++) {
      const yn = gy * kc / H;
      const v = gy * cS * 1.35 + cSy;
      const cov = promo ? 0 : (yn > 0.5 ? (yn - 0.5) * (cHaze ? 0.9 : cSea ? 0.6 : 0.42) : 0) + (yn < 0.08 ? (0.08 - yn) * 0.8 : 0);
      const my = gy - mouse.y;
      { const ly = (gy / LQ) | 0, ty = (gy - ly * LQ) / LQ, a = ly * lc, b = a + lc;
        for (let i = 0; i < lc; i++) {
          rwW[i] = LW[a + i] + (LW[b + i] - LW[a + i]) * ty; rw1[i] = L1[a + i] + (L1[b + i] - L1[a + i]) * ty;
          rw2[i] = L2[a + i] + (L2[b + i] - L2[a + i]) * ty; rwP[i] = LP[a + i] + (LP[b + i] - LP[a + i]) * ty;
        } }
      for (let gx = 0; gx < gc; gx++) {
        const o = gy * gc + gx;
        const u = gx * cS + cSx;
        let cut = cov + (calmMap ? calmMap[o] : 0) * (promo ? 0.3 : 0.42);
        let mk = 0;
        if (cMAmp > 0.01) {
          const dx = gx - mouse.x, dd = dx * dx + my * my;
          if (dd < cR2) { mk = 1 - Math.sqrt(dd) / cR; mk = mk * mk * cMAmp; cut += mk * 0.1; }
        }
        const li = lxi[gx], lt = ltx[gx];
        const w = rwW[li] + (rwW[li + 1] - rwW[li]) * lt;
        let uu = u + w * 0.5, vv = v + w * 0.3;
        let f = rw1[li] + (rw1[li + 1] - rw1[li]) * lt;
        const f2 = rw2[li] + (rw2[li + 1] - rw2[li]) * lt;
        if (f2 > f) { f = f2; uu += cB0; vv += cB1; }
        let lbias = 0;
        if (promo) { f = 0.24 + 0.56 * Math.min(1.5, MB[o] / 0.75) + 0.36 * (f - 0.45); lbias = MB[o] > 0.01 ? depthAt(o) : (AL[o] = 1, 0); }
        let b3 = 0.6, b4 = 0.6, Fv;
        if (f + 0.3 - cut > cTw - 0.12) {
          const n3 = pxNoise(uu * 4.1 + cTm * 0.016 + 3.3, vv * 4.1 - cTm * 0.011 + 1.7);
          const n4 = pxNoise(uu * 8.3 - cTm * 0.022 + 8.8, vv * 8.3 + cTm * 0.015 + 2.2);
          const q3 = n3 * 2 - 1, q4 = n4 * 2 - 1; b3 = 1 - q3 * q3; b4 = 1 - q4 * q4;
          Fv = f + 0.2 * b3 + 0.08 * b4 - 0.17 - cut;
        } else Fv = f - 0.12 - cut;
        Fv += cT - cTw;
        let fw = 0.008;
        if (Fv > cT - 0.16) {
          const xp = gx * kc;
          const e = Math.min(xp, W - xp) / cSpan;
          const sideK = e < 1 ? (1 - e) * (1 - e) : 0;
          const pn = rwP[li] + (rwP[li + 1] - rwP[li]) * lt;
          fw = 0.008 + 0.05 * pxSmooth((pn - 0.45) / 0.3) + sideK * 0.05;
        }
        const dens = pxSmooth((Fv - cT) / 0.07);
        let L;
        if (dens > 0) {
          od[gx] = od[gx] * cDecay + dens * cOdk;
          L = Math.exp(-od[gx] * 0.42) * 0.8 + 0.24 + (b3 - 0.6) * 0.34 + (b4 - 0.6) * 0.22 + mk * 0.3;
          if (promo) L += lbias + hov * 0.1;
        } else { od[gx] *= cDecay; L = 1; }
        F[o] = Fv; LB[o] = L < 0 ? 0 : L > 1 ? 1 : L; FW[o] = fw; if (!promo) AL[o] = 1;
      }
    }
  }
  /* Debug: window.__pxProf = {} accumulates ms per stage (full skies). */
  let profT = 0, fk = 1;
  function pxMark(k) {
    const P = window.__pxProf;
    if (!P || W * H <= 5e5) return;
    const n = performance.now(); P[k] = (P[k] || 0) + n - profT; profT = n;
    if (k === "put2") P.n = (P.n || 0) + 1;
  }
  const ez = (f, k) => 1 - Math.pow(1 - k, f);
  /* Restamp one dot cell (see the halftone pass): clear the old dot, stamp the new. */
  function setCell(ci, cx, cy, key) {
    const q = cy * PX_PITCH * dW + cx * PX_PITCH;
    if (cellKey[ci]) for (let yy = 0; yy < PX_PITCH; yy++) { const qq = q + yy * dW; d32[qq] = 0; d32[qq + 1] = 0; d32[qq + 2] = 0; d32[qq + 3] = 0; }
    cellKey[ci] = key;
    if (cx < dX0) dX0 = cx; if (cx > dX1) dX1 = cx; if (cy < dY0) dY0 = cy; if (cy > dY1) dY1 = cy;
    if (!key) return;
    const lv = (key & 255) - 1, off = stampOff[lv], cl = key >> 8;
    const v = stampV[cl - 1][lv];
    for (let j = 0; j < off.length; j++) d32[q + off[j]] = v[j];
  }
  function draw(ts, full) {
    const tStart = performance.now();
    const t = reduced ? 42 : (ts - t0) / 1000;
    const vPx = pxDriftSpeed(W);
    if (reduced) { ta = 42; pos = 42 * vPx; }
    else if (lastT >= 0) {
      /* Rest: ease the drift speed, never the position (see fl). */
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      fl = pxRest.idle ? Math.max(0, fl - dt / 1.5) : Math.min(1, fl + dt / 0.8);
      const sp = fl * fl * (3 - 2 * fl);
      ta += dt * sp; pos += dt * sp * vPx;
    } else { ta = t; pos = t * vPx; }
    /* Easing is per time, not per frame (tuned at 30 fps), so the 20 fps
       full skies part and settle exactly as fast as before. */
    fk = lastT >= 0 ? Math.min(3, Math.max(0, t - lastT) * 30) : 1;
    lastT = t;
    hov += (hovOn - hov) * (reduced ? 1 : ez(fk, 0.16));
    if (!pal) readPalette(true);
    if (!base) buildBase();
    if (!calmMap) buildCalm();
    easeCalm(ez(fk, 0.1));
    if (!side) buildSide();
    const P = pal, d = img.data, kf = kc / 2;
    const size = Math.max(150, Math.min(560, H * 0.55));
    const S = kc / size;
    const dir = seed[2];
    const sx = seed[0] + dir * pos / size, sy = seed[1];
    if (mouse.fresh) {
      mouse.fresh = false;
      const r = root.getBoundingClientRect();
      mouse.tx = (mouse.cx - r.left) / kc; mouse.ty = (mouse.cy - r.top) / kc;
      if (mouse.snap) { mouse.snap = false; mouse.x = mouse.tx; mouse.y = mouse.ty; }
    }
    /* Hover follows the pointer closely (was 0.12/frame: the brush trailed
       ~0.5 s behind the cursor, which read as lag). */
    { const km = ez(fk, 0.3); mouse.x += (mouse.tx - mouse.x) * km; mouse.y += (mouse.ty - mouse.y) * km; }
    mouse.amp += (mouse.on - mouse.amp) * ez(fk, 0.06);
    const R = 170 / kc, R2 = R * R, mAmp = reduced ? 0 : mouse.amp;
    const T = 0.61 - (intensity - 1) * 0.06 - P.cover;
    const decay = Math.exp(-kc / 70), odk = kc / 26;
    const sea = hz === "cloudsea", haze = hz === "haze";
    const spanSide = Math.max(120, W * 0.2);
    const tm = ta * 0.6 * PX_MORPH;
    od.fill(0);

    /* 0 · Cloud sea: five banks of cloud tops, far (small, hazy) to near
       (big, bright). Each bank is a row of round puffs (squashed circles), lit at the
       top and shaded down into the gap before the next bank. */
    profT = performance.now();
    /* Full skies alternate two kinds of frame: (0) recompute the cloud field
       and the cloud sea, repaint everything; (1) reuse that field slid
       sideways by the drift since (dlt cells, < 1 px), repaint only the cloud
       pixels, restamp the dots. The clouds move smoothly at 20 fps, the sea
       (far slower, parallax) and the dots update at 10. */
    const ph = big && !full && !reduced && !busyHover() ? (frameTick++ & 1) : -1;
    const doField = ph !== 1 || !fieldOk || promo || cm === "puff" || fieldS !== S;
    const dlt = doField ? 0 : (sx - fieldSx) / S;
    if (doField) { fieldOk = true; fieldSx = sx; fieldS = S; }
    let seaTop = null;
    if (sea && !doField) seaTop = seaTopBuf;
    else if (sea) {
      seaTop = seaTopBuf;
      seaTop.fill(rows);
      for (let li = 0; li < PX_SEA.length; li++) {
        const Ly = PX_SEA[li], e = seaEdge[li];
        const per = Ly[2] * Math.min(1.3, Math.max(0.7, W / 1200));
        const sp = per * 0.62, rr = per * 0.5, sq = Ly[1];
        const off = seed[1] * 97 + li * 41.7 + dir * pos * Ly[3];
        const by = Ly[0] * H;
        /* The puffs this frame can touch, hashed once per bank (not per column). */
        const sp2 = sp * 0.42, kA = Math.floor(off / sp) - 2, kB = Math.min(kA + seaCx.length - 1, Math.floor(((cols - 1) * kf + off) / sp) + 2);
        for (let k = kA; k <= kB; k++) {
          seaCx[k - kA] = (k + 0.5 + (pxHash(k, li, 7) - 0.5) * 0.9) * sp;
          seaRr[k - kA] = rr * (0.4 + 0.8 * pxHash(k, li, 9)) * (1 + 0.06 * Math.sin(tm * 0.08 + k * 1.7));
        }
        const jA = Math.floor(off / sp2) - 1, jB = Math.min(jA + seaCx2.length - 1, Math.floor(((cols - 1) * kf + off) / sp2) + 1);
        for (let k = jA; k <= jB; k++) {
          seaCx2[k - jA] = (k + 0.5 + (pxHash(k, li, 11) - 0.5) * 0.8) * sp2;
          seaRr2[k - jA] = rr * 0.3 * (0.5 + 0.7 * pxHash(k, li, 13));
        }
        for (let x = 0; x < cols; x++) {
          const xp = x * kf + off;
          const k0 = Math.floor(xp / sp);
          let top = -rr * 0.3;
          for (let k = Math.max(kA, k0 - 2), kz = Math.min(kB, k0 + 2); k <= kz; k++) {
            const r = seaRr[k - kA], dx = xp - seaCx[k - kA];
            if (dx > -r && dx < r) { const hgt = Math.sqrt(r * r - dx * dx) - r * 0.45; if (hgt > top) top = hgt; }
          }
          /* Small puffs riding on the domes: the cauliflower rim. */
          const j0 = Math.floor(xp / sp2);
          let sm = 0;
          for (let k = Math.max(jA, j0 - 1), kz = Math.min(jB, j0 + 1); k <= kz; k++) {
            const r = seaRr2[k - jA], dx = xp - seaCx2[k - jA];
            if (dx > -r && dx < r) { const hgt = Math.sqrt(r * r - dx * dx) - r * 0.35; if (hgt > sm) sm = hgt; }
          }
          top += sm * 0.8;
          const und = (pxNoise(xp / (per * 3.5), li * 9.1 + 0.3) - 0.5) * rr * 0.9;
          const yy = (by - (top + und) * sq) / kf;
          e[x] = yy;
          if (yy < seaTop[x]) seaTop[x] = yy;
        }
      }
    }

    pxMark('sea');
    if (!doField) { /* the field stays */ } else
    if (cm !== "puff") {
    const Tw = T + 0.012;
    /* Promo: the layout (PX_PROMO metaballs) decides where clouds are; the
       wispy noise only shapes their edges, so they stay painterly. */
    if (promo) accumClouds(tm, dir, ta);
    /* 1 · Coarse pass (default "wispy"): the realistic streaky cumulus —
       domain-warped value noise gathered into heaps, a billow term rounding
       the rims, lit by optical depth down each column. F is the field, L the
       light, FW how wide the dotted fringe is.
       One layer of mid-size clouds (07.10.26, owner: more clouds, not bigger):
       the same cumulus field is read twice, the second copy offset in noise
       space, and the denser of the two wins — about twice the clouds, each the
       size it always was. All of them thin out behind data-px-calm content. */
    /* The warp, both banks' two base octaves and the fringe-width noise are
       smooth over dozens of cells: evaluate them on a lattice every LQ cells
       and interpolate (exact to ~1e-3, a fraction of the edge width); only
       the billow octaves near an edge are evaluated per cell. */
    const t6 = tm * 0.006, t4 = tm * 0.004, t8 = tm * 0.008, t5 = tm * 0.005, t2 = tm * 0.002, B0 = PX_BANK2[0], B1 = PX_BANK2[1], B2 = PX_BANK2[2];
    for (let ly = 0; ly < lr; ly++) {
      const v = ly * LQ * S * 1.35 + sy;
      for (let lx = 0, o = ly * lc; lx < lc; lx++, o++) {
        const u = lx * LQ * S + sx;
        const w = pxNoise(u * 0.7 + t6, v * 0.7 - t4) - 0.5;
        const uu = u + w * 0.5, vv = v + w * 0.3, ub = uu + B0, vb = vv + B1;
        LW[o] = w;
        L1[o] = 0.55 * pxNoise(uu * 0.9, vv * 0.9) + 0.2 * pxNoise(uu * 1.9 + 5.2 - t8, vv * 1.9 + 7.1 + t5);
        L2[o] = 0.55 * pxNoise(ub * 0.9, vb * 0.9) + 0.2 * pxNoise(ub * 1.9 + 5.2 - t8, vb * 1.9 + 7.1 + t5) - B2;
        LP[o] = pxNoise(u * 0.5 + 70.3, v * 0.5 + 12.1 + t2);
      }
    }
    cT = T; cTw = Tw; cS = S; cSx = sx; cSy = sy; cTm = tm; cMAmp = mAmp; cR = R; cR2 = R2; cHaze = haze; cSea = sea; cDecay = decay; cOdk = odk; cSpan = spanSide; cB0 = B0; cB1 = B1;
    coarseWispy();
    } else {
    /* 1 · Coarse pass ("puff"). Each cumulus is a cluster of round puffs summed as
       metaballs (domed top, flat base), its rim broken up by billow noise;
       F is the field, L the light (optical depth down each column, darker
       toward the base), FW how wide the dotted fringe is. */
    accumClouds(tm, dir, ta);
    for (let gy = 0; gy < gr; gy++) {
      const v = gy * S * 1.35 + sy;
      const my = gy - mouse.y;
      for (let gx = 0; gx < gc; gx++) {
        const o = gy * gc + gx;
        const m = MB[o];
        let cut = (calmMap ? calmMap[o] : 0) * 0.5;
        if (m < 0.02) { F[o] = T - 0.3; FW[o] = 0.02; AL[o] = 1; od[gx] *= decay; continue; }
        const lbias = depthAt(o);
        let mk = 0;
        if (mAmp > 0.01) {
          const dx = gx - mouse.x, dd = dx * dx + my * my;
          if (dd < R2) { mk = 1 - Math.sqrt(dd) / R; mk = mk * mk * mAmp; cut += mk * 0.12; }
        }
        const u = gx * S + sx;
        const n3 = pxNoise(u * 4.1 + tm * 0.016 + 3.3, v * 4.1 - tm * 0.011 + 1.7);
        const n4 = pxNoise(u * 9.3 - tm * 0.022 + 8.8, v * 9.3 + tm * 0.015 + 2.2);
        const q3 = n3 * 2 - 1, q4 = n4 * 2 - 1, b3 = 1 - q3 * q3, b4 = 1 - q4 * q4;
        const Fv = T + (m - 0.42) * 0.42 + (b3 - 0.62) * (promo ? 0.3 : 0.22) + (b4 - 0.62) * (promo ? 0.13 : 0.08) - cut;
        const xp = gx * kc;
        const e = Math.min(xp, W - xp) / spanSide;
        const sideK = e < 1 ? (1 - e) * (1 - e) : 0;
        const pn = pxNoise(u * 0.6 + 70.3, v * 0.6 + 12.1 + tm * 0.002);
        const fw = 0.02 + 0.15 * pxSmooth((pn - 0.38) / 0.32) + sideK * 0.1;
        const dens = pxSmooth((Fv - T) / 0.06);
        od[gx] = od[gx] * decay + dens * odk;
        const pl = PL[o] / (MB[o] + 0.05);
        const L = Math.exp(-od[gx] * 0.5) * 0.66 + 0.24 + pl * 0.2 + (b3 - 0.6) * 0.3 + (b4 - 0.6) * 0.14 + mk * 0.2 + lbias + (promo ? hov * 0.1 : 0);
        F[o] = Fv; LB[o] = L < 0 ? 0 : L > 1 ? 1 : L; FW[o] = fw;
      }
    }

    }

    pxMark('seaCoarse');
    /* 2 · Fine pass at 1/2 res: crisp smoothstep edge + detail octave. */
    const lit = P.lit, sh = P.shade, lo = P.low;
    const E = cm === "puff" ? 0.013 : 0.024, dsc = S * 7.5, dvs = S * 7.5 * 1.35, dox = sx * 15, doy = sy * 15;
    const NS = PX_SEA.length, seaInv = seaInvBuf;
    for (let li = 0; li < NS; li++) seaInv[li] = kf / (PX_SEA[li][2] * PX_SEA[li][1] * 0.75);
    const thF = T - 0.03;
    /* Interior fast path (full skies: opaque clouds):
       past T + E + the widest soft edge, dn = 1 and the alpha is 1. */
    const fastIn = !promo && cm !== "puff", thIn = T + E + 0.035;
    if (fastIn && cloudLutSig !== palSig) {
      cloudLutSig = palSig;
      for (let q = 0; q < 256; q++) { const L = q / 255; cloudLut[q] = pxPack(sh[0] + (lit[0] - sh[0]) * L, sh[1] + (lit[1] - sh[1]) * L, sh[2] + (lit[2] - sh[2]) * L); }
    }
    pxNoiseAxis(nXi, nXu, cols, dsc, dox, 257); pxNoiseAxis(nXi2, nXu2, cols, dsc * 2.3, dox * 2.3 + 17, 257);
    pxNoiseAxis(nYi, nYv, rows, dvs, doy, 1); pxNoiseAxis(nYi2, nYv2, rows, dvs * 2.3, doy * 2.3, 1);
    fSea = seaTop; fFast = fastIn; fThIn = thIn; fSh = sh; fLit = lit; fLo = lo; fT = T; fE = E; fDsc = dsc; fDvs = dvs; fDox = dox; fDoy = doy;
    /* Fine column → coarse cell and weight (with the slide, clamped at the edges). */
    for (let g = 0; g < gc; g++) { qA[g] = cols; qB[g] = 0; }
    for (let x = 0; x < cols; x++) {
      const gf = x * 0.5 + dlt; let g = Math.floor(gf), t = gf - g;
      if (g < 0) { g = 0; t = 0; } else if (g > gc - 2) { g = gc - 2; t = 1; }
      xg[x] = g; xt[x] = t; if (x < qA[g]) qA[g] = x; qB[g] = x + 1;
    }
    /* The clear sky is the static base: copy it, then visit only the 2×2
       pixel quads whose coarse cell corners reach a cloud edge, and each
       column below its cloud-sea top. Same pixels as a full scan. */
    if (doField) D32.set(base32);
    else for (let i = 0; i < cloudN; i++) { const o = cloudList[i]; D32[o] = base32[o]; }  /* last frame's cloud pixels */
    cloudN = 0;
    for (let gy0 = 0, gyN = (rows + 1) >> 1; gy0 < gyN; gy0++) {
      const rowA = gy0 * gc, rowB = rowA + gc;
      for (let gx0 = 0; gx0 < gc - 1; gx0++) {
        const xa = qA[gx0], xb = qB[gx0];
        if (xb <= xa) continue;
        if (F[rowA + gx0] <= thF && F[rowA + gx0 + 1] <= thF && F[rowB + gx0] <= thF && F[rowB + gx0 + 1] <= thF) continue;
        for (let y = gy0 * 2, y1 = Math.min(rows, y + 2); y < y1; y++) for (let x = xa; x < xb; x++) {
          if (ridgeTop && y > ridgeTop[x] + 1) continue;
          if (seaTop && y > seaTop[x]) continue;
          const o = y * cols + x; D32[o] = px(x, y); cloudList[cloudN++] = o;
        }
      }
    }
    pxMark('cloudPx');
    if (seaTop && doField) {
      /* Bank bodies: the shading down from each bank's top is a fixed ramp per
         bank, so the plain body pixels read a 128-step colour table; edges
         (antialias rows, a ridge just below) take the full path. */
      if (seaLutSig !== palSig) {
        seaLutSig = palSig;
        for (let li = 0; li < NS; li++) for (let q = 0; q < 128; q++) {
          const dy = q / 127, L = 1 - dy * dy * (3 - 2 * dy) * 0.5, hv = PX_SEA[li][4];
          let cr = sh[0] + (lit[0] - sh[0]) * L, cg = sh[1] + (lit[1] - sh[1]) * L, cb = sh[2] + (lit[2] - sh[2]) * L;
          cr += (lo[0] - cr) * hv; cg += (lo[1] - cg) * hv; cb += (lo[2] - cb) * hv;
          seaLut[li * 128 + q] = pxPack(cr, cg, cb);
        }
      }
      /* Column by column, in runs: between two bank tops the nearest bank
         above is fixed, so a run is a walk down that bank's colour ramp. */
      for (let x = 0; x < cols; x++) {
        const st = seaTop[x], yE = ridgeTop ? Math.min(rows - 1, Math.floor(ridgeTop[x] + 1)) : rows - 1;
        let y = Math.max(0, Math.floor(st) + 1);
        for (; y <= yE && y < st + 1.5; y++) D32[y * cols + x] = px(x, y);
        let li = 0;
        while (y <= yE) {
          for (let j = NS - 1; j > li; j--) if (seaE[j * cols + x] <= y) { li = j; break; }
          let yN = yE + 1;  /* where a nearer bank's top comes next */
          for (let j = li + 1; j < NS; j++) { const q = Math.ceil(seaE[j * cols + x]); if (q < yN) yN = q; }
          const e = seaE[li * cols + x], inv = seaInv[li], lb = li * 128;
          for (; y < yN; y++) {
            const ea = y - e;
            if (ea < 1) { D32[y * cols + x] = px(x, y); continue; }
            const dy = ea * inv;
            D32[y * cols + x] = seaLut[lb + (dy >= 1 ? 127 : (dy * 127 + 0.5) | 0)];
          }
        }
      }
    }
    /* Stars, behind the clouds. */
    if (stars.length) {
      for (let i = 0, j = 0; i < stars.length; i += 5, j++) {
        const x = stars[i], y = stars[i + 1];
        const o4 = (y * cols + x) * 4, o3 = (y * cols + x) * 3;
        if (D32[o4 >> 2] === starV[j]) D32[o4 >> 2] = base32[o4 >> 2];  /* undo last frame's star */
        const cloud = Math.abs(d[o4] - base[o3]) + Math.abs(d[o4 + 2] - base[o3 + 2]);
        if (cloud > 12) continue;
        const tw = stars[i + 2] * (reduced ? 0.8 : 0.7 + 0.3 * Math.sin(ta * stars[i + 4] + stars[i + 3]));
        d[o4] += (220 - d[o4]) * tw; d[o4 + 1] += (228 - d[o4 + 1]) * tw; d[o4 + 2] += (240 - d[o4 + 2]) * tw;
        starV[j] = D32[o4 >> 2];
      }
    }
    pxMark('fine');
    ctx.putImageData(img, 0, 0);
    pxMark('put1');

    /* 3 · Halftone: dots in the fringe outside each cloud edge and above
       each cloud-sea bank, plus the static side screen. Stamped at CSS
       pixels into one ImageData. */
    /* Full skies restamp the dots on every other frame (10 fps, see ph): a
       dot cell is 4 CSS px and the clouds move < 1 px between restamps. */
    if (ph !== 0) {
    /* Each 4×4 cell remembers what it shows (cellKey: class << 8 | level+1);
       only cells whose dot changed are cleared and restamped, and only the
       rectangle around them is uploaded. */
    const dc = P.dot, aC = P.night ? 0.45 : 0.85, aS = P.night ? 0.22 : 0.38;
    const thD = T - 0.115;
    if (aLutSig !== palSig || stampW !== dW) {
      aLutSig = palSig; stampW = dW;
      for (let q = 0; q <= 32; q++) aLut[q] = (((Math.min(1, q / 32) * 255) | 0) << 24) | (dc[2] << 16) | (dc[1] << 8) | dc[0];
      stampOff = PX_STAMPS.map((st) => { const o = new Int32Array(st.length / 3); for (let s = 0; s < st.length; s += 3) o[s / 3] = st[s + 1] * dW + st[s]; return o; });
      stampV = [aC, aS].map((a) => PX_STAMPS.map((st) => { const v = new Int32Array(st.length / 3); for (let s = 0; s < st.length; s += 3) v[s / 3] = aLut[Math.round(st[s + 2] * a * 32)]; return v; }));
      dotsReset = true;
    }
    if (dotsReset || !cellKey || cellKey.length !== ncx * ncy) { dotsReset = false; d32.fill(0); cellKey = new Int32Array(ncx * ncy); dX0 = 0; dY0 = 0; dX1 = ncx - 1; dY1 = ncy - 1; }
    else { dX0 = ncx; dY0 = ncy; dX1 = -1; dY1 = -1; }
    if (seaTop) for (let li = 0; li < NS; li++) for (let cx = 0; cx < ncx; cx++)
      seaFw[li * ncx + cx] = 6 + 22 * pxSmooth((pxNoise((cx * PX_PITCH + 2) / 90 + li * 7, li + tm * 0.01) - 0.35) / 0.4);
    for (let cy = 0; cy < ncy; cy++) {
      const py = cy * PX_PITCH + 2;
      const gyf = py / kc, gy0 = Math.min(gr - 2, gyf | 0), ty = gyf - gy0;
      const fyr = py / kf;
      for (let cx = 0; cx < ncx; cx++) {
        const px = cx * PX_PITCH + 2;
        const fx = Math.min(cols - 1, (px / kf) | 0);
        const ci = cy * ncx + cx;
        let wC = 0, bare = true;
        if (!(ridgeTop && fyr > ridgeTop[fx] - 1)) {
        let seaIn = false; bare = false;
        if (seaTop && fyr > seaTop[fx] - 40 / kf) {
          /* Above a bank's edge (and over the bank behind it): fringe dots. */
          for (let li = 0; li < NS; li++) {
            const dd = (seaE[(li) * cols + fx] - fyr) * kf;
            if (dd > 0) {
              const fwp = seaFw[li * ncx + cx];
              if (dd < fwp) { const k = 1 - dd / fwp; if (k > wC) wC = k * k; }
            }
          }
          if (fyr >= seaTop[fx]) { seaIn = true; if (wC < 0.07) bare = true; }
        }
        if (!seaIn) {
          let gxf = px / kc + dlt; if (gxf < 0) gxf = 0; else if (gxf > gc - 1.001) gxf = gc - 1.001;
          const gx0 = Math.min(gc - 2, gxf | 0), tx = gxf - gx0;
          const i00 = gy0 * gc + gx0, i10 = i00 + 1, i01 = i00 + gc, i11 = i01 + 1;
          if (F[i00] > thD || F[i10] > thD || F[i01] > thD || F[i11] > thD) {
          const fa = F[i00] + (F[i10] - F[i00]) * tx, fb = F[i01] + (F[i11] - F[i01]) * tx;
          const f = fa + (fb - fa) * ty;
          const wa = FW[i00] + (FW[i10] - FW[i00]) * tx, wb = FW[i01] + (FW[i11] - FW[i01]) * tx;
          const fw = wa + (wb - wa) * ty;
          if (fw > 0.035) {
            const lo = T - fw, hi = T + E + Math.max(0, fw - 0.05) * 0.55;
            if (f > lo && f < hi) { const k = (f - lo) / (hi - lo); const c = k * Math.sqrt(k) * AL[i00]; if (c > wC) wC = c; }
          }
          }
        }
        }
        let key = 0;
        if (!bare) {
          const wS = side[ci];
          const w = wC >= wS ? wC : wS;
          if (w >= 0.07) key = (wC >= wS ? 1 : 2) << 8 | (Math.min(PX_NL - 1, (w * PX_NL) | 0) + 1);
        }
        if (key !== cellKey[ci]) setCell(ci, cx, cy, key);
      }
    }
    pxMark('dots');
    if (dX1 >= dX0) dctx.putImageData(dimg, 0, 0, dX0 * PX_PITCH, dY0 * PX_PITCH, (dX1 - dX0 + 1) * PX_PITCH, (dY1 - dY0 + 1) * PX_PITCH);
    }
    pxMark('put2');
    if (!shown) reveal();
    const ms = performance.now() - tStart;
    if (W * H > 1e6) { pxStats.bigN = (pxStats.bigN || 0) + 1; pxStats.bigMs = (pxStats.bigMs || 0) + ms; }  /* full-screen skies */
    pxStats.frames++; pxStats.ms += ms; if (ms > (pxStats.max || 0)) pxStats.max = ms;
  }

  /* Frame pacing: 20 fps on full skies, 24 on small ones (frameMs); paused
     when the tab is hidden, the sky is off-screen, or something opaque
     covers it completely (checked once a second). */
  function loop(ts) {
    raf = 0;
    if (stopped || hidden || !inView || reduced || covered || parked) return;
    /* Rest: the page is idle, the drift has eased to 0 and every hover /
       calm easing has settled — paint one full frame and stop scheduling.
       The next input wakes it (pxRest → kick). */
    if (pxRest.idle && fl === 0 && settled()) { if (!restDrawn) { restDrawn = true; draw(ts, true); } return; }
    restDrawn = false;
    raf = requestAnimationFrame(loop);
    /* While the pointer is in the sky (or a hover is easing) small skies run
       at display rate and full skies at 30 fps with a full field each frame,
       so the clouds track the cursor; otherwise 24 fps (small) / 20 (full). */
    const hv = busyHover(), fm = hv ? (big ? 33 : 16) : frameMs;
    if (ts - last < fm - 4) return;
    /* 24 fps on a 60 Hz display is an even 2/3-vsync cadence (33/50 ms):
       step the clock by frameMs instead of snapping it to ts. */
    last = !hv && !big && ts - last < fm * 2 ? last + fm : ts;
    if (ts - lastPal > 1000) { lastPal = ts; readPalette(false); readCalm(); }
    draw(ts);
  }
  function busyHover() { return mouse.on === 1 || mouse.amp > 0.02 || Math.abs(hovOn - hov) > 0.003; }
  /* Nothing left to ease: the pointer brush has reached the cursor and its
     strength its target, the promo hover and the calm map are settled. */
  function settled() {
    return !calmLive && Math.abs(mouse.on - mouse.amp) < 0.02 && Math.abs(hovOn - hov) < 0.003 &&
      (mouse.on === 0 || (Math.abs(mouse.tx - mouse.x) < 0.5 && Math.abs(mouse.ty - mouse.y) < 0.5 && !mouse.fresh));
  }
  let restDrawn = false;
  const onRest = (idle) => { if (!idle) kick(); };
  pxRest.subs.add(onRest);
  function kick() { if (booted && !raf && !stopped && !hidden && inView && !reduced && !covered && !parked) raf = requestAnimationFrame(loop); }
  function still() { readPalette(false); draw(performance.now(), true); }
  /* Covered: every sample point inside the viewport hits something outside
     this sky that is painted opaque (its own or an ancestor's background,
     up to the shared ancestor). Translucent overlays, popovers over a part
     of the sky, or pointer-events quirks all count as visible. */
  function opaqueHit(el) {
    for (let n = el, i = 0; n && i < 6 && !n.contains(root); n = n.parentElement, i++) {
      const cs = window.getComputedStyle(n);
      if (cs.opacity !== "1" || cs.visibility === "hidden") return false;
      const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      if (m) { const a = m[1].split(","); if (a.length < 4 || parseFloat(a[3]) >= 0.97) return true; }
      if (n.tagName === "CANVAS" || n.tagName === "IMG" || n.tagName === "VIDEO") return true;
    }
    return false;
  }
  function checkCovered() {
    if (typeof document.elementFromPoint !== "function") return false;
    const r = root.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    let seen = 0;
    for (let i = 0; i < 5; i++) {
      const fx = i === 0 ? 0.5 : i & 1 ? 0.1 : 0.9, fy = i === 0 ? 0.5 : i < 3 ? 0.1 : 0.9;
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      seen++;
      const el = document.elementFromPoint(x, y);
      if (!el || root.contains(el) || el.contains(root) || !opaqueHit(el)) return false;
    }
    return seen > 0;
  }

  /* Mount without a long task: measure now; build the static layers and
     draw the first frame in three idle slices (≤ ~100 ms late). Until then the
     canvases are hidden (the sky's ground colour shows, never an unpainted
     black canvas) and the first frame fades in. */
  let booted = false, shown = false;
  canvas.style.opacity = "0"; dotCanvas.style.opacity = "0";
  function reveal() {
    shown = true;
    const tr = reduced ? "" : "opacity 220ms ease";
    canvas.style.transition = tr; dotCanvas.style.transition = tr;
    canvas.style.opacity = ""; dotCanvas.style.opacity = "";
  }
  resize(); readPalette(true); readCalm();
  const bootSteps = [() => { if (!base) buildBase(); }, () => { if (!side) buildSide(); }, () => { booted = true; draw(performance.now(), true); kick(); }];
  let bootId = 0;
  const bootNext = () => { bootId = 0; if (stopped) return; bootSteps.shift()(); if (bootSteps.length) bootId = ric(bootNext, 40); };
  bootId = ric(bootNext, 60);
  const calmT = window.setTimeout(() => { readCalm(); if (reduced) draw(performance.now(), true); }, 420);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const r = root.getBoundingClientRect();
    if (Math.max(1, r.width) === W && Math.max(1, r.height) === H) return;  /* the initial callback, or no change */
    needResize = true; schedule();
  }) : null;
  if (ro) ro.observe(root);
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; kick(); }) : null;
  if (io) io.observe(root);
  const onVis = () => { hidden = document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVis);
  const onTime = () => { readPalette(true); draw(performance.now(), true); };
  window.addEventListener("px-time", onTime);
  const onMq = () => { reduced = !!(mq && mq.matches); still(); kick(); };
  if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
  const slow = window.setInterval(() => {
    if (stopped || hidden || !inView || parked || (!raf && pxRest.idle)) return;
    if (reduced) { const a = readCalm(), b = readPalette(false); if (a || b) draw(performance.now(), true); return; }
    const c = checkCovered();
    if (c !== covered) { covered = c; kick(); }
  }, 1000);
  const onMove = (e) => {
    if (opt.interactive === false) return;
    if (e.pointerType === "touch" && !mouse.touch) return;
    mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.fresh = true;
    if (mouse.on === 0) { mouse.snap = true; mouse.on = 1; kick(); }
  };
  const onLeave = (e) => { if (!e || e.pointerType !== "touch") mouse.on = 0; };
  /* Touch (08.10.26, owner: "where are the clouds?"): the brush follows a
     finger — it lands on pointerdown, follows touchmove (the browser's
     pointer stream stops with pointercancel once it scrolls) and fades on
     pointerup / touchend / touchcancel. Every listener is passive and none
     calls preventDefault, so the page still scrolls under the finger. */
  const onDown = (e) => {
    if (opt.interactive === false || e.pointerType !== "touch") return;
    mouse.touch = true; mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.fresh = true;
    if (mouse.on === 0) mouse.snap = true;
    mouse.on = 1; kick();
  };
  const onTouchMove = (e) => {
    if (!mouse.touch || !e.touches || !e.touches.length) return;
    mouse.cx = e.touches[0].clientX; mouse.cy = e.touches[0].clientY; mouse.fresh = true; kick();
  };
  const onTouchEnd = (e) => {
    if (e.type === "pointercancel" || (e.pointerType && e.pointerType !== "touch")) return;
    if (e.touches && e.touches.length) return;
    if (mouse.touch) { mouse.touch = false; mouse.on = 0; kick(); }
  };
  const tOpt = { passive: true };
  let scrollT = 0, scrollEnd = 0;
  const onScroll = () => {
    window.clearTimeout(scrollEnd);
    scrollEnd = window.setTimeout(() => { readCalm(); if (reduced) draw(performance.now(), true); else kick(); }, 120);
    const n = performance.now(); if (n - scrollT < 80) return; scrollT = n; readCalm(); if (reduced) draw(n, true); else kick();
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
  const fv = (el) => { try { return el.matches(":focus-visible"); } catch (e) { return false; } };
  let hovPtr = 0, hovKey = 0;
  const hovSet = () => { hovOn = hovPtr || hovKey ? 1 : 0; if (reduced) { hov = hovOn; draw(performance.now(), true); } else kick(); };
  const onEnter = (e) => { if (e.pointerType !== "touch") { hovPtr = 1; hovSet(); } };
  const onExit = () => { hovPtr = 0; hovSet(); };
  const onFocus = () => { hovKey = fv(promoHost) ? 1 : 0; hovSet(); };
  const onBlur = () => { hovKey = 0; hovSet(); };
  if (promo) {
    promoHost.addEventListener("pointerenter", onEnter); promoHost.addEventListener("pointerleave", onExit);
    promoHost.addEventListener("focus", onFocus); promoHost.addEventListener("blur", onBlur);
  }

  /* Debug: window.__pxBench(n) draws every live sky n times back to back (no
     compositor in between) and returns the mean ms per draw per sky. */
  const benchEntry = { root, state: () => ({ size: Math.round(W) + "x" + Math.round(H), running: !!raf, covered, parked, inView, booted, fps: Math.round(1000 / frameMs), drift: +fl.toFixed(2), settled: settled(), brush: +mouse.amp.toFixed(2), touch: !!mouse.touch }), step(ts, full) { draw(ts, full); }, bench(n) { const t0b = performance.now(); let ts = t0b; const tt = performance.now(); for (let i = 0; i < n; i++) { ts += frameMs; draw(ts); } return [Math.round(W) + "x" + Math.round(H), +((performance.now() - tt) / n).toFixed(2)]; } };
  pxLive.add(benchEntry);
  kick();
  return {
    set(mood, dark) { opt.mood = mood; opt.dark = dark; readPalette(true); draw(performance.now(), true); },
    /* Parked: no frames at all (the last one stays painted) — for a sky in a
       layer that is closed, sliding or being dragged (menu A's card). */
    park(v) { const was = parked; parked = !!v; if (was && !parked) { last = 0; kick(); } },
    stop() {
      pxLive.delete(benchEntry); pxRest.subs.delete(onRest);
      stopped = true; if (raf) cancelAnimationFrame(raf); if (idleId) cic(idleId); if (bootId) cic(bootId);
      if (ro) ro.disconnect(); if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scope.removeEventListener("scroll", onScroll, { capture: true }); window.clearTimeout(scrollEnd);
      window.removeEventListener("px-time", onTime);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
      window.clearInterval(slow); window.clearTimeout(calmT);
      scope.removeEventListener("pointermove", onMove, tOpt); scope.removeEventListener("pointerleave", onLeave, tOpt);
      scope.removeEventListener("pointerdown", onDown, tOpt); scope.removeEventListener("pointerup", onTouchEnd, tOpt);
      scope.removeEventListener("touchmove", onTouchMove, tOpt); scope.removeEventListener("touchend", onTouchEnd, tOpt); scope.removeEventListener("touchcancel", onTouchEnd, tOpt);
      if (promo) {
        promoHost.removeEventListener("pointerenter", onEnter); promoHost.removeEventListener("pointerleave", onExit);
        promoHost.removeEventListener("focus", onFocus); promoHost.removeEventListener("blur", onBlur);
      }
    }
  };
}

/* ── CSS ─────────────────────────────────────────────────────────────── */
const PX_CSS = `
.px-sky, [data-px-scope] { --px-ground: var(--sky-ground); --px-ink: var(--sky-ink); --px-ink-2: var(--sky-ink-2); --px-ink-3: var(--sky-ink-3);
  --px-halo: var(--sky-halo); --px-shadow: var(--sky-shadow); --px-line: var(--sky-line); --px-tint: var(--sky-tint); --px-hue: var(--sky-hue);
  --px-chip: var(--sky-chip); --px-chip-hover: var(--sky-chip-hover); --px-chip-ink: var(--sky-chip-ink); }
.px-sky { position: absolute; inset: 0; overflow: hidden; isolation: isolate; color: var(--px-ink); background: var(--px-ground); }
.px-canvas, .px-dotscreen { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; image-rendering: auto; }
.px-grain { position: absolute; inset: 0; pointer-events: none; opacity: .03; background-size: 128px 128px; }
.dark .px-grain { opacity: .035; }
.px-content { position: relative; z-index: 1; height: 100%; }

.px-display { font-family: "Exposure VAR", Georgia, serif; font-weight: 400; font-variation-settings: "EXPO" -14; letter-spacing: -0.01em; line-height: .96; }
.px-display em { font-style: italic; font-variation-settings: "EXPO" 8; padding-right: .04em; }
.px-on-sky { color: var(--px-ink); text-shadow: 0 1px 2px var(--px-shadow), 0 0 18px var(--px-halo); }
.px-kicker { font: 600 11px/14px ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--px-ink-3);
  text-shadow: 0 1px 2px var(--px-shadow), 0 0 12px var(--px-halo); }
.px-glass .px-kicker { color: var(--text-tertiary); text-shadow: none; }

/* Glass — measured from Craft's paywall plan card. */
.px-glass { position: relative; box-sizing: border-box; border-radius: 26px; color: var(--text-primary);
  background-color: var(--white-a60); background-image: linear-gradient(var(--white-a0) 0%, var(--white-a80) 100%);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  box-shadow: var(--black-a4) 0 8px 16px -4px, var(--black-a8) 0 12px 24px -4px, var(--color-white) 0 0 0 1px inset, var(--white-a60) 0 0 0 1px, var(--black-a19) 0 0 0 1px;
  transition: box-shadow 220ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.24, 1); }
.px-glass.is-strong { background-color: var(--white-a72); }
.px-glass.is-best { box-shadow: var(--black-a4) 0 8px 16px -4px, var(--black-a8) 0 12px 24px -4px, var(--color-white) 0 0 0 1px inset, var(--ink-fixed) 0 0 0 1px; }
.dark .px-glass { background-color: var(--smoke-a55); background-image: linear-gradient(var(--smoke-a0) 0%, var(--smoke-a85) 100%);
  box-shadow: var(--black-a30) 0 10px 20px -6px, var(--black-a45) 0 24px 48px -12px, var(--white-a8) 0 0 0 1px inset, var(--white-a10) 0 0 0 1px; }
.dark .px-glass.is-strong { background-color: var(--smoke-a70); }
.dark .px-glass.is-best { box-shadow: var(--black-a30) 0 10px 20px -6px, var(--black-a45) 0 24px 48px -12px, var(--white-a8) 0 0 0 1px inset, var(--white-a85) 0 0 0 1px; }
.px-glass.is-click:hover { transform: translateY(-2px); box-shadow: var(--black-a6) 0 10px 20px -4px, var(--black-a12) 0 18px 32px -6px, var(--color-white) 0 0 0 1px inset, var(--white-a60) 0 0 0 1px, var(--black-a19) 0 0 0 1px; }
.dark .px-glass.is-click:hover { box-shadow: var(--black-a35) 0 12px 24px -6px, var(--black-a50) 0 28px 56px -12px, var(--white-a10) 0 0 0 1px inset, var(--white-a14) 0 0 0 1px; }
.px-glass .px-caption { display: block; padding: 8px 4px 0; font: 500 11.5px/14px var(--font-sans); color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.px-glass .nx-btn-secondary { background: var(--surface-raised); }
/* Craft's segmented-control track. */
.px-track { background-color: var(--white-a30); background-image: linear-gradient(var(--white-a0) 0%, var(--white-a40) 100%);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); border-radius: 9999px;
  box-shadow: var(--white-a60) 0 0 0 1px inset, var(--black-a6) 0 0 0 1px; }
.dark .px-track { background-color: var(--smoke-a40); background-image: linear-gradient(var(--smoke-a0) 0%, var(--smoke-a60) 100%);
  box-shadow: var(--white-a8) 0 0 0 1px inset, var(--white-a10) 0 0 0 1px; }
/* Entry animations on the sky release their end state (a held animation
   makes a backdrop root, and glass inside it would blur nothing). */
.px-sky .nx-swap, .px-sky .nx-pop, .px-sky .pw-print-in, .px-sky .ax-step, .px-sky .mb-step,
[data-px-scope] .nx-swap, [data-px-scope] .pw-print-in, [data-px-scope] .mb-step { animation-fill-mode: backwards !important; }

.px-badge { display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 3px 8px; box-sizing: border-box; border-radius: 7px; white-space: nowrap;
  font: 600 11px/13px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; color: var(--text-on-fill); background: var(--badge-dark-bg); }
.dark .px-badge { box-shadow: var(--white-a16) 0 0 0 1px inset; }
.px-badge.is-green { color: var(--status-success-fg); background: var(--status-success-bg); }
.dark .px-badge.is-green { color: var(--status-success-fg); background: var(--status-success-bg); box-shadow: none; }
.px-badge.is-glass { color: var(--px-chip-ink); background: var(--px-chip);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); box-shadow: var(--white-a60) 0 0 0 1px inset; }

.px-chip-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; cursor: default; color: var(--px-chip-ink);
  background-color: var(--white-a55); background-image: linear-gradient(var(--white-a0), var(--white-a35));
  box-shadow: var(--white-a70) 0 0 0 1px inset, var(--black-a8) 0 0 0 1px, var(--black-a8) 0 4px 10px -4px;
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  transition: background-color 140ms ease, transform 90ms ease; }
.px-chip-btn:hover { background-color: var(--white-a78); }
.dark .px-chip-btn { background-color: var(--smoke-a55); background-image: none; box-shadow: var(--white-a10) 0 0 0 1px inset, var(--black-a30) 0 4px 10px -4px; }
.dark .px-chip-btn:hover { background-color: var(--smoke-hi-a75); }
.px-chip-btn:active { transform: scale(.97); }

.px-dots { display: inline-flex; align-items: center; gap: 6px; padding: 7px 9px; border-radius: 999px; color: var(--px-chip-ink);
  background-color: var(--white-a30); background-image: linear-gradient(var(--white-a0), var(--white-a40));
  box-shadow: var(--white-a60) 0 0 0 1px inset; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.dark .px-dots { background-color: var(--smoke-a45); background-image: none; box-shadow: var(--white-a10) 0 0 0 1px inset; }
.px-dot { display: block; width: 8px; height: 8px; padding: 0; border: 0; border-radius: 999px; cursor: default; background: currentColor; opacity: .25;
  transition: width 260ms cubic-bezier(0.2, 0.9, 0.24, 1), opacity 200ms ease; }
.px-dot.is-done { opacity: .5; }
.px-dot.is-on { width: 26px; opacity: 1; }
button.px-dot:hover { opacity: .7; }
button.px-dot.is-on:hover { opacity: 1; }

@media (prefers-reduced-motion: reduce) { .px-glass, .px-dot { transition: none; } }
`;
let pxCssDone = false;
function pxEnsureCss() {
  if (pxCssDone || typeof document === "undefined") return;
  pxCssDone = true;
  const s = document.createElement("style");
  s.setAttribute("data-px-scenes", "");
  s.textContent = PX_CSS;
  document.head.appendChild(s);
}

/* ── Components ─────────────────────────────────────────────────────── */
function PxSky({ variant, intensity, interactive, horizon, meadow, clouds, scene, radius, mood, dark, parked, engine, fps, className, style, children }) {
  pxEnsureCss();
  const root = React.useRef(null), cv = React.useRef(null), dv = React.useRef(null), eng = React.useRef(null);
  const hz = pxHorizonOf({ horizon, meadow });
  const live = React.useRef({}); live.current = { mood, dark, parked };
  React.useEffect(() => {
    if (!root.current || !cv.current || !dv.current) return undefined;
    const L = live.current;
    const e = pxStart(root.current, cv.current, dv.current, { variant, intensity, interactive, horizon: hz, clouds, scene, fps, mood: L.mood || undefined, dark: L.dark, parked: L.parked });
    eng.current = e; e.made = (L.mood || "") + "|" + L.dark; if (engine) engine.current = e;
    return () => { e.stop(); eng.current = null; if (engine && engine.current === e) engine.current = null; };
  }, [variant, intensity, interactive, hz, clouds, scene, fps]);
  /* mood / dark change in place (no remount); parked starts / stops frames. */
  React.useEffect(() => {
    const e = eng.current, k = (mood || "") + "|" + dark;
    if (e && e.made !== k) { e.made = k; e.set(mood || undefined, dark); }
  }, [mood, dark]);
  React.useEffect(() => { if (eng.current) eng.current.park(parked); }, [parked]);
  return (
    <div ref={root} className={"px-sky" + (className ? " " + className : "")} data-px-sky={variant || "a"} data-px-horizon={hz}
      style={Object.assign({ borderRadius: radius || 0 }, style)}>
      <canvas ref={cv} className="px-canvas" aria-hidden="true" />
      <canvas ref={dv} className="px-dotscreen" aria-hidden="true" />
      <div className="px-grain" aria-hidden="true" style={{ backgroundImage: "url(" + pxGrain() + ")" }} />
      {children != null ? <div className="px-content">{children}</div> : null}
    </div>
  );
}

/* No `...rest` destructuring here: Babel-standalone compiles every classic
   script into one global scope, so its shared `_excluded` helper list is
   overwritten by later files and `strong` / `best` leaked to the DOM. */
const PX_GLASS_OWN = { pad: 1, radius: 1, width: 1, caption: 1, strong: 1, best: 1, className: 1, style: 1, onClick: 1, label: 1, children: 1 };
function GlassCard(props) {
  const { pad, radius, width, caption, strong, best, className, style, onClick, label, children } = props;
  const rest = {};
  for (const k in props) if (!PX_GLASS_OWN[k]) rest[k] = props[k];
  pxEnsureCss();
  const p = pad == null ? 20 : pad;
  const clickable = !!onClick;
  return (
    <div {...rest} className={"px-glass" + (strong ? " is-strong" : "") + (best ? " is-best" : "") + (clickable ? " is-click" : "") + (className ? " " + className : "")}
      role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined} aria-label={clickable ? label : undefined}
      onClick={onClick} onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      style={Object.assign({ width: width, padding: p, borderRadius: radius == null ? 26 : radius }, style)}>
      {children}
      {caption ? <span className="px-caption">{caption}</span> : null}
    </div>
  );
}

function PxBadge({ tone, className, style, children }) {
  pxEnsureCss();
  return <span className={"px-badge" + (tone === "glass" ? " is-glass" : tone === "green" ? " is-green" : "") + (className ? " " + className : "")} style={style}>{children}</span>;
}

/* Pill progress: the current step is a long pill, the rest small dots. */
function PxDots({ count, index, onPick, label, names, className, style }) {
  pxEnsureCss();
  const items = [];
  for (let n = 0; n < count; n++) {
    const cls = "px-dot" + (n === index ? " is-on" : n < index ? " is-done" : "");
    items.push(onPick
      ? <button key={n} type="button" className={cls} data-px-dot={n} aria-label={"Step " + (n + 1) + (names && names[n] ? ": " + names[n] : "")}
          aria-current={n === index ? "step" : undefined} onClick={() => onPick(n)} />
      : <span key={n} className={cls} />);
  }
  return (
    <div role="progressbar" aria-label={label || "Progress"} aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1}
      className={"px-dots" + (className ? " " + className : "")} style={style}>{items}</div>
  );
}

Object.assign(window, { PxSky, GlassCard, PxBadge, PxDots, pxEnsureCss, pxPalette });
