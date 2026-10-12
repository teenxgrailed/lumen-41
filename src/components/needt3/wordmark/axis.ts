/* Copied from src/components/needt/wordmark/axis.ts (pure maths, no DOM): v3 must not import the v2 tree, which the contract step deletes. */
/* THE EXPOSURE AXIS — pure maths, no DOM.
 *
 * `ExposureWordmark` drives a single variable-font axis, `EXPO` (−100…+100,
 * resting 0), and does it by writing straight to the element every frame
 * (PORT.md §8) — so the numbers that decide WHAT to write have to be provable
 * on their own, with nothing about React or the DOM in the way. This module
 * is that proof: five generators, a torch target, and a spring step, each a
 * function of time rather than of a component's lifecycle.
 *
 * The font is duplexed — every axis position shares one advance width — so
 * none of this has to reason about layout. It only ever produces a number.
 *
 * Negative is ink flooding the counters; positive is light burning the
 * strokes away. Breathe only ever inks (0 → depth → 0, depth negative);
 * pulse only ever burns (0 → peak → 0, peak positive). That opposition is
 * the whole idea of the mark, and it is asserted in the tests below rather
 * than left to be noticed.
 */

export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export interface SpringState {
  readonly v: number;
  readonly vel: number;
  readonly target: number;
}

export interface AxisRange {
  /** How far positive the axis may go here. 0 disables pulse and torch. */
  readonly ceiling: number;
  readonly floor: number;
  readonly roof: number;
}

export interface ComposeInput {
  /** breathe(t) already multiplied by its live amplitude tween. */
  readonly breathe: number;
  readonly pulse: number;
  /** The torch spring's current value (already lerped 0..ceiling). */
  readonly torch: number;
  readonly floor: number;
  readonly roof: number;
  /** The busy tween's current value; > EW_BUSY_EPSILON overrides everything below it. */
  readonly busy?: number;
  /** Present while develop-in owns the letter; overrides everything. */
  readonly developValue?: number;
}

/** Pointer-driven falloff: 180px radius, one spring per letter. */
export const EW_RADIUS = 180;
/** Positive room for torch and busy. Past ~60 the strokes fragment. */
export const EW_MAX = 55;
/** Below this the mark is static — no loop, no listeners. */
export const EW_MIN_SIZE = 28;
/** At and above this the full ±100 range applies; below it, −40…0. */
export const EW_FULL_SIZE = 44;
export const EW_SPRING: SpringConfig = { stiffness: 220, damping: 26, mass: 1 };
export const EW_BREATHE = { cycle: 5200, depth: -100, offset: 260 } as const;
export const EW_PULSE = {
  dur: 1300,
  peak: 70,
  at: 0.35,
  stagger: 80,
  every: 6000,
} as const;
export const EW_DEVELOP_MS = 620;
export const EW_DEVELOP_STAGGER_MS = 85;
/** The value busy holds at while it is on. Same number as EW_MAX. */
export const EW_BUSY_CEILING = 55;
export const EW_BUSY_UP_MS = 300;
export const EW_BUSY_DOWN_MS = 400;
/** Below this a tween is treated as settled at its target. */
export const EW_SETTLE_EPSILON = 0.05;

export function ewClamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function ewLerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function ewSmoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

export function ewEaseOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ewEaseOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Rounds to one decimal — the resolution `write()` puts on the element. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * DEVELOP-IN, once on mount: `floor` → 0 over 620ms, easeOutCubic, 85ms
 * stagger per letter. `floor` is the size's own floor (−100 full, −40 rail),
 * not a constant, so the print comes up from wherever this letter's range
 * starts.
 */
export function developInAt(ms: number, index: number, floor = -100): number {
  const t = ewClamp((ms - index * EW_DEVELOP_STAGGER_MS) / EW_DEVELOP_MS, 0, 1);
  return round1(floor - floor * ewEaseOutCubic(t));
}

/**
 * BREATHE: a half-cosine from 0 to `EW_BREATHE.depth` and back over one
 * 5200ms cycle, 260ms later for every letter after the first — the phase
 * spread that makes it a travelling wave rather than a synchronised throb.
 * Always <= 0: this is the ink direction only.
 */
export function breatheAt(ms: number, index: number): number {
  const phase = ms - index * EW_BREATHE.offset;
  const u =
    (((phase % EW_BREATHE.cycle) + EW_BREATHE.cycle) % EW_BREATHE.cycle) /
    EW_BREATHE.cycle;
  const v = (EW_BREATHE.depth * (1 - Math.cos(u * Math.PI * 2))) / 2;
  return round1(v);
}

/**
 * PULSE: a one-shot burst to `EW_BREATHE`'s opposite sign — up to `peak`
 * (positive) at 35% of 1300ms, easeOutExpo both ways, 80ms stagger per
 * letter, meant to be re-triggered every `EW_PULSE.every`. `ms` is time
 * since the pulse started (negative or past the window returns 0). Always
 * >= 0: this is the burn direction only, the opposite of breathe.
 */
export function pulseAt(ms: number, index: number): number {
  const t = ms - index * EW_PULSE.stagger;
  if (t <= 0 || t >= EW_PULSE.dur) return 0;
  const peakAt = EW_PULSE.dur * EW_PULSE.at;
  const v =
    t < peakAt
      ? EW_PULSE.peak * ewEaseOutExpo(t / peakAt)
      : EW_PULSE.peak *
        (1 - ewEaseOutExpo((t - peakAt) / (EW_PULSE.dur - peakAt)));
  return round1(v);
}

/**
 * TORCH's target, per letter: distance to the cursor through a smoothstep
 * falloff over `radius`, then lerped onto 0..`ceiling`. This is only the
 * TARGET — the letter is driven onto it by a spring (`springStep`), never
 * assigned directly, because the spring's lag is the whole effect.
 */
export function torchTargetAt(
  distancePx: number,
  radius: number,
  ceiling: number
): number {
  const d = ewClamp(distancePx / radius, 0, 1);
  const t = 1 - ewSmoothstep(d);
  return ewLerp(0, ceiling, t);
}

/**
 * One semi-implicit Euler step of a damped spring, F = −k·x − c·v, toward
 * `state.target`. Pure: returns the next state rather than mutating. `dtMs`
 * is real elapsed time, matching the rest of this module.
 */
export function springStep(
  state: SpringState,
  dtMs: number,
  spring: SpringConfig = EW_SPRING
): SpringState {
  const dt = dtMs / 1000;
  const f =
    -spring.stiffness * (state.v - state.target) - spring.damping * state.vel;
  const vel = state.vel + (f / spring.mass) * dt;
  const v = state.v + vel * dt;
  return { v, vel, target: state.target };
}

/** True once a spring has settled close enough to its target to stop the loop. */
export function springSettled(state: SpringState): boolean {
  return (
    Math.abs(state.v - state.target) <= EW_SETTLE_EPSILON &&
    Math.abs(state.vel) <= EW_SETTLE_EPSILON
  );
}

/**
 * The size clamp, both ends (PORT.md's "Sizes" table). At and above
 * `EW_FULL_SIZE` the full ±100 range applies; below it (down to
 * `EW_MIN_SIZE`) the axis is clamped to −40…0, which disables pulse and
 * torch there by arithmetic (ceiling 0) rather than a special case. Below
 * `EW_MIN_SIZE` the caller does not run the loop at all; this function does
 * not know about that cutoff.
 */
export function axisRangeForSize(px: number): AxisRange {
  const full = px >= EW_FULL_SIZE;
  return {
    ceiling: full ? EW_MAX : 0,
    floor: full ? -100 : -40,
    roof: full ? 100 : 0,
  };
}

/**
 * One resolved value per letter per frame, composed in the order PORT.md's
 * brief states it: breathe and pulse sum, torch adds on top and the whole
 * thing clamps to the letter's range, then busy overrides it, then a develop
 * value (if present) overrides everything including busy — the develop-in
 * animation hands over on its own completion, never mid-flight.
 */
export function composeAxisValue(input: ComposeInput): number {
  if (input.developValue !== undefined) return input.developValue;
  let value = ewClamp(
    input.breathe + input.pulse + input.torch,
    input.floor,
    input.roof
  );
  if (input.busy !== undefined && input.busy > EW_SETTLE_EPSILON) {
    value = input.busy;
  }
  return value;
}

/**
 * The multiplier `.ew-sculpt` reads as `--ew-lift`, formula preserved as-is
 * from the prototype: 1 at rest, above 1 when inked (negative), below 1 when
 * burned (positive) — one fixed light applied to the live axis value. Note:
 * the prototype's own comment claims "+55 → 0.62"; this formula actually
 * gives 0.807 at +55 (see the report for this discrepancy).
 */
export function liftFor(value: number): number {
  return Number((1 - value / 285).toFixed(3));
}
