/**
 * Menu A's spring and rubber band (prototype nav-a.jsx `nvaStep` /
 * `nvaRubber`), so every phone gesture feels the same. Pure: the caller owns
 * the state object and writes the result to a `transform` through a ref.
 */

export interface Spring {
  /** Position. */
  x: number;
  /** Velocity, units per second. */
  v: number;
}

/**
 * Advance a damped spring toward `target` by `dt` seconds (semi-implicit
 * Euler in steps of at most 1/240 s, so a long frame cannot blow it up).
 * `k` is stiffness, `zeta` the damping ratio. Returns true once it is at rest.
 */
export function springStep(
  s: Spring,
  target: number,
  dt: number,
  k: number,
  zeta: number
) {
  const c = 2 * Math.sqrt(k) * zeta;
  let left = dt;
  while (left > 0) {
    const h = Math.min(left, 1 / 240);
    const a = -k * (s.x - target) - c * s.v;
    s.v += a * h;
    s.x += s.v * h;
    left -= h;
  }
  return Math.abs(s.x - target) < 0.0006 && Math.abs(s.v) < 0.004;
}

/** Rubber band: `x` past the edge, eased so it slows but never stops dead; `d` is the limit. */
export const rubber = (x: number, d: number) =>
  (1 - 1 / ((x * 0.55) / d + 1)) * d;
