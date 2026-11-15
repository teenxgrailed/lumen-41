"use client";

import { useSyncExternalStore } from "react";

import { joinRest } from "@/components/needt3/scenes/sky-rest";

/**
 * One answer to "is anybody looking?" for everything that moves on its own:
 * canvas and requestAnimationFrame loops, CSS infinite animations, per-second
 * clocks, polling.
 *
 * `active` is true while the tab is visible AND the person has touched the
 * page (pointer, key, wheel, touch) within the last REST_MS. It turns false
 * when the tab is hidden or the page has been left alone, and true again on
 * the next input or when the tab comes back.
 *
 * Three ways to use it, all backed by the same listeners (they exist only
 * while someone is subscribed; MotionRuntime always is):
 *  - `usePageActive()` in a component;
 *  - `onPageActive(fn)` in a canvas or timer loop: stop scheduling frames on
 *    `false`, start again on `true`;
 *  - CSS: `html[data-needt-idle]` is set while not active, so a rule can pause
 *    an infinite animation with `animation-play-state: paused` (see
 *    styles/v3-overrides/idle-pause.css). Nothing is removed, only paused.
 */

export interface PageActivity {
  /** The tab is on screen. */
  visible: boolean;
  /** No input for REST_MS. */
  idle: boolean;
  /** visible && !idle: the only state in which something may move. */
  active: boolean;
}

export const IDLE_ATTRIBUTE = "data-needt-idle";

type Listener = (state: PageActivity) => void;

const SSR_STATE: PageActivity = { visible: true, idle: false, active: true };

let state: PageActivity = SSR_STATE;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;
let restIdle = false;

function visibleNow(): boolean {
  return typeof document === "undefined" ? true : !document.hidden;
}

function apply() {
  const visible = visibleNow();
  const idle = restIdle;
  const active = visible && !idle;
  if (
    state.visible === visible &&
    state.idle === idle &&
    state.active === active
  ) {
    return;
  }
  state = { visible, idle, active };
  const root = document.documentElement;
  if (active) root.removeAttribute(IDLE_ATTRIBUTE);
  else root.setAttribute(IDLE_ATTRIBUTE, visible ? "idle" : "hidden");
  listeners.forEach((fn) => fn(state));
}

function start() {
  restIdle = false;
  state = { visible: visibleNow(), idle: false, active: visibleNow() };
  const { rest, leave } = joinRest((idle) => {
    restIdle = idle;
    apply();
  });
  restIdle = rest.idle;
  const onVisibility = () => apply();
  document.addEventListener("visibilitychange", onVisibility, {
    passive: true,
  });
  apply();
  stop = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    leave();
    document.documentElement.removeAttribute(IDLE_ATTRIBUTE);
    state = SSR_STATE;
    restIdle = false;
  };
}

/** Current state. Reading does not subscribe. */
export function getPageActivity(): PageActivity {
  return state;
}

/**
 * Call `fn` whenever the state changes. Returns the unsubscribe. The first
 * subscriber attaches the shared listeners, the last one detaches them.
 */
export function subscribePageActivity(fn: Listener): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (listeners.size === 0) start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

/**
 * For loops: `fn(true)` now if the page is active, then on every change.
 * Returns the unsubscribe.
 */
export function onPageActive(fn: (active: boolean) => void): () => void {
  const off = subscribePageActivity((s) => fn(s.active));
  fn(state.active);
  return off;
}

/** True while the tab is visible and the page has been touched lately. */
export function usePageActive(): boolean {
  return useSyncExternalStore(
    (notify) => subscribePageActivity(notify),
    () => state.active,
    () => true
  );
}

/**
 * A clock that shows seconds: ticks every `ms` while the tab is visible (a
 * person watching a timer with no input still sees it move), stops while the
 * tab is hidden, and reads once as it comes back. Returns the stop.
 */
export function visibleInterval(fn: () => void, ms: number): () => void {
  if (typeof document === "undefined") return () => undefined;
  let id = 0;
  const arm = () => {
    if (!id) id = window.setInterval(fn, ms);
  };
  const disarm = () => {
    if (id) window.clearInterval(id);
    id = 0;
  };
  const sync = () => {
    if (document.hidden) {
      disarm();
      return;
    }
    if (!id) fn();
    arm();
  };
  document.addEventListener("visibilitychange", sync);
  if (!document.hidden) arm();
  return () => {
    document.removeEventListener("visibilitychange", sync);
    disarm();
  };
}
