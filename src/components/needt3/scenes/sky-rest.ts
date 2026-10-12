/**
 * The pixel sky's pause rules, as plain functions and one small state machine
 * so they can be tested without a canvas (prototype scenes.jsx: `pxRest`,
 * `loop`, `draw`).
 *
 * The rules, in the order the loop applies them:
 *   1. No frames at all while the tab is hidden, the sky is off-screen, an
 *      opaque element covers it, it is parked, or reduced motion is on
 *      (reduced motion paints one still frame, redrawn only when the words or
 *      the palette change).
 *   2. Idle: no pointer / key / wheel / touch input for REST_MS. The drift
 *      eases to 0 over REST_DOWN_S and the sky then stops scheduling frames
 *      with its last frame still painted.
 *   3. Any input eases the drift back up over REST_UP_S. The speed is eased;
 *      the position and the clock never jump.
 *   4. Pacing: full skies 20 fps, small ones 24, 30 / display rate while the
 *      pointer is in the sky.
 */

/** Input-free time before every sky settles. */
export const REST_MS = 12_000;
/** The drift eases to 0 over this long once the page is idle... */
export const REST_DOWN_S = 1.5;
/** ...and back up over this long on the next input. */
export const REST_UP_S = 0.8;
/** A sky larger than this many CSS px² is a "full" sky. */
export const FULL_SKY_AREA = 5e5;
/** Frame period (ms): full skies 20 fps, small ones 24. */
export const FULL_FRAME_MS = 50;
export const SMALL_FRAME_MS = 42;
/** While the pointer is in the sky: full skies 30 fps, small skies display rate. */
export const HOVER_FULL_FRAME_MS = 33;
export const HOVER_SMALL_FRAME_MS = 16;

export interface GateInput {
  hidden: boolean;
  inView: boolean;
  reduced: boolean;
  covered: boolean;
  parked: boolean;
}

/** May the sky schedule another frame at all? (rules 1) */
export function mayAnimate(g: GateInput): boolean {
  return !g.hidden && g.inView && !g.reduced && !g.covered && !g.parked;
}

export interface RestInput {
  idle: boolean;
  /** The eased drift factor, 0..1. */
  drift: number;
  /** Everything that eases (brush, hover, calm map) has arrived. */
  settled: boolean;
}

/**
 * Should the loop stop scheduling frames (after painting one last full
 * frame)? Only when the page is idle, the drift is fully eased out and
 * nothing else is still moving.
 */
export function atRest(r: RestInput): boolean {
  return r.idle && r.drift === 0 && r.settled;
}

/** One step of the drift ease; the position integrates this, so it never jumps. */
export function easeDrift(
  drift: number,
  dtSeconds: number,
  idle: boolean
): number {
  const dt = Math.max(0, dtSeconds);
  return idle
    ? Math.max(0, drift - dt / REST_DOWN_S)
    : Math.min(1, drift + dt / REST_UP_S);
}

/** The smoothstep of the drift: the factor the clock and position advance by. */
export function driftSpeed(drift: number): number {
  return drift * drift * (3 - 2 * drift);
}

export interface PaceInput {
  /** The sky is larger than FULL_SKY_AREA. */
  big: boolean;
  /** The pointer is in the sky or a hover is still easing. */
  hover: boolean;
  /** A lower rate asked for by an accent sky (the phone's: 15). */
  fps?: number;
}

/** The minimum time between frames, ms. */
export function framePeriod({ big, hover, fps }: PaceInput): number {
  if (hover) return big ? HOVER_FULL_FRAME_MS : HOVER_SMALL_FRAME_MS;
  const base = big ? FULL_FRAME_MS : SMALL_FRAME_MS;
  return fps && fps > 0 ? Math.max(base, Math.round(1000 / fps)) : base;
}

export type RestListener = (idle: boolean) => void;

/**
 * Shared idle detector. Pure: the DOM binding below feeds it `touch()` on
 * input and `check()` from a timer.
 */
export class RestMachine {
  idle = false;
  private last: number;
  private readonly subs = new Set<RestListener>();

  constructor(
    private readonly now: () => number,
    private readonly restMs = REST_MS
  ) {
    this.last = now();
  }

  subscribe(f: RestListener): () => void {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  }

  get size() {
    return this.subs.size;
  }

  /** Input happened. Wakes every sky if the page was idle. */
  touch() {
    this.last = this.now();
    if (!this.idle) return;
    this.idle = false;
    this.subs.forEach((f) => f(false));
  }

  /**
   * Timer tick. Returns how long to wait before the next check, or null once
   * the page is idle (the next `touch()` re-arms it).
   */
  check(): number | null {
    if (this.idle) return null;
    const left = this.restMs - (this.now() - this.last);
    if (left > 0) return left + 50;
    this.idle = true;
    this.subs.forEach((f) => f(true));
    return null;
  }
}

/* ── DOM binding: one detector for every sky on the page ─────────────────── */

let machine: RestMachine | null = null;
let timer = 0;
let detach: (() => void) | null = null;

function arm(ms: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    const next = machine?.check();
    if (next != null) arm(next);
  }, ms);
}

function attach(m: RestMachine) {
  // Not "scroll": the app scrolls by itself; a person's scroll always starts
  // with wheel / touch / key / pointerdown. Passive, capture, never blocks.
  const opts = { passive: true, capture: true } as const;
  const names = [
    "pointermove",
    "pointerdown",
    "keydown",
    "wheel",
    "touchstart",
  ];
  const wake = () => {
    const wasIdle = m.idle;
    m.touch();
    if (wasIdle) arm(REST_MS + 50);
  };
  const vis = () => {
    if (!document.hidden) wake();
  };
  names.forEach((n) => window.addEventListener(n, wake, opts));
  document.addEventListener("visibilitychange", vis, { passive: true });
  arm(REST_MS + 50);
  return () => {
    names.forEach((n) => window.removeEventListener(n, wake, opts));
    document.removeEventListener("visibilitychange", vis);
    window.clearTimeout(timer);
    timer = 0;
  };
}

/**
 * Join the shared detector. Listeners exist only while at least one sky is
 * mounted. Returns the machine (read `.idle`) and a release function.
 */
export function joinRest(listener: RestListener): {
  rest: RestMachine;
  leave: () => void;
} {
  if (!machine) machine = new RestMachine(() => performance.now());
  const m = machine;
  if (m.size === 0) detach = attach(m);
  const off = m.subscribe(listener);
  return {
    rest: m,
    leave: () => {
      off();
      if (m.size === 0 && detach) {
        detach();
        detach = null;
        machine = null;
      }
    },
  };
}
