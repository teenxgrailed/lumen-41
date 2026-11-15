/**
 * How far the Needt word is filled. Pure.
 *
 * Known progress maps straight to the fill. Unknown progress (a route chunk
 * has no byte count) eases toward `EASED_CEILING` and slows as it nears it:
 * the curve is an asymptote, so it never reaches the ceiling, let alone 1.
 * Only a real `progress` of 1 completes the word.
 */

/** Where unknown progress heads for, and never reaches. */
export const EASED_CEILING = 0.9;

/** Time constant of the ease: after this long the word is ~63% of the way to the ceiling. */
export const EASED_TAU_MS = 2200;

/** A fraction in 0..1; anything else (NaN, negative, over 1) is pulled in. */
export function clampFill(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** The fill after `elapsedMs` of waiting with no progress signal. */
export function easedFill(elapsedMs: number): number {
  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  return EASED_CEILING * (1 - Math.exp(-t / EASED_TAU_MS));
}

/** The fill to draw: the real progress when there is one, else the eased one. */
export function fillFor(args: {
  progress: number | undefined;
  elapsedMs: number;
}): number {
  return args.progress === undefined
    ? easedFill(args.elapsedMs)
    : clampFill(args.progress);
}

/** The right-hand inset (percent) that reveals `fill` of the word from the left. */
export function fillInsetPct(fill: number): number {
  return Math.round((1 - clampFill(fill)) * 10000) / 100;
}

/**
 * One clock for every mounted word. A route change can unmount one loading
 * word and mount another (the Suspense fallback, then the route's own); a new
 * instance continues the fill where the last stopped instead of blinking back
 * to empty. The clock resets once no word has been mounted for `CLOCK_GRACE_MS`.
 */
export const CLOCK_GRACE_MS = 400;
let clockStart: number | null = null;
let clockUsers = 0;
let clockReset: ReturnType<typeof setTimeout> | null = null;

/** A word mounted: returns when the shared wait began (now, if it is the first). */
export function acquireLoadingClock(now: number): number {
  if (clockReset) {
    clearTimeout(clockReset);
    clockReset = null;
  }
  clockUsers += 1;
  if (clockStart === null) clockStart = now;
  return clockStart;
}

/** A word unmounted. */
export function releaseLoadingClock() {
  clockUsers = Math.max(0, clockUsers - 1);
  if (clockUsers > 0 || clockReset) return;
  clockReset = setTimeout(() => {
    clockReset = null;
    if (clockUsers === 0) clockStart = null;
  }, CLOCK_GRACE_MS);
}

/** Test seam. */
export function resetLoadingClock() {
  if (clockReset) clearTimeout(clockReset);
  clockReset = null;
  clockStart = null;
  clockUsers = 0;
}
