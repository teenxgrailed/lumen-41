/**
 * Value noise for the pixel sky (prototype scenes.jsx, "Value noise").
 * A fixed seed and a fixed lattice, so a given sky is the same on every
 * machine and every load.
 */
const PERM = new Uint8Array(512);
const VAL = new Float32Array(256);

(function seedNoise() {
  let s = 1234567;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const p: number[] = [];
  for (let i = 0; i < 256; i++) {
    p.push(i);
    VAL[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

/**
 * The lattice values V[P[P[X] + Y]] flattened into one 257x257 table (the
 * extra row / column repeats the first, as P wraps), so a sample is four
 * plain reads.
 */
export const NOISE_GRID: Float32Array = (function () {
  const g = new Float32Array(257 * 257);
  for (let X = 0; X < 257; X++)
    for (let Y = 0; Y < 257; Y++)
      g[X * 257 + Y] = VAL[PERM[PERM[X & 255] + (Y & 255)]];
  return g;
})();

export function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const i = (xi & 255) * 257 + (yi & 255);
  const G = NOISE_GRID;
  const a = G[i];
  const b = G[i + 257];
  const c = G[i + 1];
  const d = G[i + 258];
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * One axis of `noise` for samples p = k * step + off (k = 0 ... n-1): lattice
 * index (times stride) and smoothstep weight, so a 2-D sample is four reads.
 */
export function noiseAxis(
  idx: Int32Array,
  wt: Float32Array,
  n: number,
  step: number,
  off: number,
  stride: number
) {
  for (let k = 0; k < n; k++) {
    const p = k * step + off;
    const pi = Math.floor(p);
    const f = p - pi;
    idx[k] = (pi & 255) * stride;
    wt[k] = f * f * (3 - 2 * f);
  }
}

export function hash3(a: number, b: number, c: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
