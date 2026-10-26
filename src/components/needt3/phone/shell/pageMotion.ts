/**
 * The phone's page change (owner decision 2026-10-26, docs/handoff/
 * design-reconciliation-2026-09-11.md): moving between places, the page now
 * moves with a direction instead of swapping, so the change is noticed.
 *
 *   forward  the new page slides in from the right over the old one, which
 *            gives way a short distance to the left and dims
 *   back     the same, mirrored
 *   rise     a place opened from the menu (not one of the dock's three) rises
 *            from the dock: scale 0.96 -> 1, a short lift and a fade, over
 *            the old page
 *
 * Only the page moves. The dock, the fog (a fixed layer inside the screen,
 * which is why the transform goes on `.pk-scroll` and not on the stage), the
 * sync dot and every sheet stay put. The durations and the ease live in
 * phone-page-motion.css; the numbers here are only what the script needs to
 * clean up after them, and a test pins the two together.
 *
 * How the old page stays on screen: the route children are replaced in one
 * commit, so the outgoing page is gone before anything can animate. The
 * script keeps a still copy of it taken at the tap (a "ghost", a clone of the
 * stage without its fixed layers), shows it in the new page's place and
 * removes it when the new page has arrived. Everything that is not a tap on a
 * menu entry or an internal link (back/forward, a redirect) has no ghost and
 * only slides in, or is left alone.
 */
import { pkScrollY } from "../kit/scroll";
import { pkReduced } from "../kit/util";
import type { MenuPlaceId } from "../menu/places";

export type PageMotion = "forward" | "back" | "rise";

/** The CSS durations (phone-page-motion.css --pg-*), in ms. */
export const PAGE_MOTION_MS = { slide: 360, rise: 340, fade: 150 } as const;

/** Past this many nodes a ghost costs more than it is worth: no ghost. */
export const GHOST_MAX_NODES = 2500;
/** A tap that never led to a new place forgets its ghost after this. */
export const GHOST_TTL_MS = 2500;
/** How long the old page waits for the new one before it gives up the screen. */
export const GHOST_WAIT_MS = 450;
/** How long the stage keeps asking for the motion while the page streams in. */
const STAGE_TTL_MS = 3000;
/** A route change this soon after a popstate is Back/Forward: Safari's own. */
export const POP_WINDOW_MS = 800;

/* ───────────────────────── pure: which way it goes ───────────────────────── */

/** The first path segment: what keys the stage (V3Shell `placeKey`). */
export function placeKeyOf(path: string): string {
  const clean = path.split("#")[0].split("?")[0];
  return clean.split("/")[1] ?? "";
}

/**
 * Where a place sits along the dock: its index among the three tiles, or one
 * past them (the "more" end, where the menu card is) for every other place.
 */
export function dockSlot(
  id: MenuPlaceId | null,
  tiles: readonly MenuPlaceId[]
): number {
  const i = id ? tiles.indexOf(id) : -1;
  return i < 0 ? tiles.length : i;
}

/**
 * The motion for a move from one place to another, or null when it is the
 * same place. A dock tile goes toward its side: to the right of where you
 * were is `forward`, to the left `back`. Anything that is not a tile (a place
 * from the menu card, an unknown page) rises from the dock. Pure.
 */
export function pageMotionFor(
  from: MenuPlaceId | null,
  to: MenuPlaceId | null,
  tiles: readonly MenuPlaceId[]
): PageMotion | null {
  if (from === to) return null;
  if (!to || !tiles.includes(to)) return "rise";
  return dockSlot(to, tiles) > dockSlot(from, tiles) ? "forward" : "back";
}

/* ───────────────────────────── the ghost ───────────────────────────── */

interface Pending {
  ghost: HTMLElement | null;
  at: number;
  timer: number;
}
interface Live {
  stage: HTMLElement;
  ghost: HTMLElement | null;
  timers: number[];
  off: () => void;
}

let pending: Pending | null = null;
let live: Live | null = null;

/**
 * Animations switched off (the setting, or a hidden tab): no page change.
 * MotionRuntime also writes "off" for the system's Reduce Motion, and that one
 * still gets the 150 ms crossfade, so the attribute only counts when the system
 * does not ask for less motion.
 */
const motionOff = () =>
  typeof document === "undefined" ||
  (!pkReduced() &&
    document.documentElement.getAttribute("data-animations") === "off");

const hostEl = () =>
  document.querySelector<HTMLElement>("[data-v2p-host]") ?? null;
const stageOf = (host: HTMLElement | null) =>
  (host &&
    Array.from(host.children).find((c) =>
      c.classList.contains("v2p-stage")
    )) as HTMLElement | null;

/** Layers that are fixed to the screen, or belong to the old page's overlays. */
const GHOST_STRIP =
  ".pk-fog, .pk-sweep, .pk-sheet-layer, .pk-scrim, [data-pg-ghost]";

function buildGhost(stage: HTMLElement, scrollY: number): HTMLElement {
  const clone = stage.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-pg");
  clone.querySelectorAll(GHOST_STRIP).forEach((n) => n.remove());
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  // a canvas is cloned blank: copy its pixels
  const from = stage.querySelectorAll("canvas");
  const to = clone.querySelectorAll("canvas");
  from.forEach((c, i) => {
    try {
      to[i]?.getContext("2d")?.drawImage(c, 0, 0);
    } catch {
      /* a tainted or lost canvas just stays blank for the length of the motion */
    }
  });
  const sheet = document.createElement("div");
  sheet.className = "pk-pg-sheet";
  sheet.style.top = `${-scrollY}px`;
  sheet.appendChild(clone);
  const ghost = document.createElement("div");
  ghost.className = "pk-pg-ghost";
  ghost.setAttribute("data-pg-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  ghost.appendChild(sheet);
  return ghost;
}

function dropPending() {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pending = null;
}

/**
 * Called on the tap that is about to change the place (a menu entry, an
 * internal link), before the router moves: keeps a still copy of the page.
 * Cheap to call twice; never throws.
 */
export function pageMotionCapture(): void {
  if (typeof document === "undefined") return;
  dropPending();
  if (motionOff()) return;
  let ghost: HTMLElement | null = null;
  try {
    const stage = stageOf(hostEl());
    if (stage && stage.getElementsByTagName("*").length <= GHOST_MAX_NODES)
      ghost = buildGhost(stage, pkScrollY());
  } catch {
    ghost = null;
  }
  pending = {
    ghost,
    at: performance.now(),
    timer: window.setTimeout(() => {
      pending = null;
    }, GHOST_TTL_MS),
  };
}

/** Forget a captured ghost without playing it (Back/Forward, a no-op tap). */
export function pageMotionDiscard(): void {
  dropPending();
}

function finish() {
  if (!live) return;
  const l = live;
  live = null;
  l.timers.forEach((t) => window.clearTimeout(t));
  l.off();
  l.ghost?.remove();
  l.stage.removeAttribute("data-pg");
}

/**
 * The route changed (called from a layout effect, before the first paint of
 * the new stage). Marks the stage so the CSS can move the page, and puts the
 * ghost under it. `null` kind just forgets the ghost.
 */
export function pageMotionRun(kind: PageMotion | null): void {
  if (typeof document === "undefined") return;
  const ghost = pending?.ghost ?? null;
  dropPending();
  finish();
  if (!kind || motionOff()) return;
  const host = hostEl();
  const stage = stageOf(host);
  if (!host || !stage) return;
  // reduced motion crosses over the old page; with none there is nothing to do
  if (pkReduced() && !ghost) return;

  stage.setAttribute("data-pg", kind);
  if (ghost) {
    ghost.setAttribute("data-pg", kind);
    host.appendChild(ghost);
  }

  const timers: number[] = [];
  let waitTimer = 0;
  const isPage = (e: AnimationEvent) => e.animationName.startsWith("v3-pg-in");
  const onStart = (e: AnimationEvent) => {
    if (!isPage(e) || !ghost) return;
    // the page has arrived: the old one gives way with it, in the same frame
    ghost.setAttribute("data-pg-go", "");
    window.clearTimeout(waitTimer);
  };
  const onEnd = (e: AnimationEvent) => {
    if (isPage(e)) finish();
  };
  stage.addEventListener("animationstart", onStart);
  stage.addEventListener("animationend", onEnd);
  stage.addEventListener("animationcancel", onEnd);
  // the page is still streaming in: show what is there instead of a stale page
  waitTimer = window.setTimeout(() => ghost?.remove(), GHOST_WAIT_MS);
  timers.push(waitTimer);
  timers.push(window.setTimeout(finish, STAGE_TTL_MS));

  live = {
    stage,
    ghost,
    timers,
    off: () => {
      stage.removeEventListener("animationstart", onStart);
      stage.removeEventListener("animationend", onEnd);
      stage.removeEventListener("animationcancel", onEnd);
    },
  };
}

/** Test seam: forget everything. */
export function pageMotionReset(): void {
  dropPending();
  finish();
}
