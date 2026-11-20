"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared clock for every tile that has several things to show. A tile
 * does not run a timer or a frame loop of its own: this module holds a single
 * one-second interval that exists only while a tile is listening, stands
 * still while the page is hidden, and tells each listener only when ITS
 * answer changes (so one swap re-renders one tile, not the menu).
 */

/** Seconds a tile rests on one item before the next blurs in. */
export const CYCLE_S = 4;

let beat = 0;
let timer = 0;
const subs = new Set<() => void>();

function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  beat += 1;
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  // the first tile to listen starts the timeline: every opening of the menu
  // begins on the first page of each tile
  if (!subs.size) beat = 0;
  subs.add(f);
  if (!timer && typeof window !== "undefined")
    timer = window.setInterval(tick, 1000);
  return () => {
    subs.delete(f);
    if (!subs.size) beat = 0;
    if (!subs.size && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}

const noop = () => () => {};

/** The index (of `len`) a tile shows now. `offset` staggers tiles by a second each. */
export function cycleIndex(beatNow: number, len: number, offset: number) {
  if (len < 2) return 0;
  const phase = ((offset % CYCLE_S) + CYCLE_S) % CYCLE_S;
  return Math.max(0, Math.floor((beatNow - phase) / CYCLE_S)) % len;
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Which of `len` items a tile shows. Always 0 (and no listener, no timer)
 * for one item, while `active` is false (the menu is being edited) and under
 * prefers-reduced-motion, which gets a static view.
 */
export function useCycle(len: number, offset: number, active: boolean) {
  const on = active && len > 1 && !prefersReducedMotion();
  return useSyncExternalStore(
    on ? subscribe : noop,
    () => (on ? cycleIndex(beat, len, offset) : 0),
    () => 0
  );
}

/** Test seam: the clock's current second and a way to advance it. */
export const __beat = {
  get: () => beat,
  set: (n: number) => {
    beat = n;
    subs.forEach((f) => f());
  },
  listeners: () => subs.size,
};
