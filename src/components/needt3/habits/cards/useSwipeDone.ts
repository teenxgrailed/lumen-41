"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";

import { pkTrack } from "../../phone/kit/pointer";

/** How far a card has to travel right to count as done. */
export const SWIPE_DONE_AT = 96;
/** Past this and a short flick counts too. */
export const FLICK_AT = 40;
const FLICK_PX_PER_MS = 0.5;
/** Held still this long before release, and the speed is gone: not a flick. */
export const FLICK_STALE_MS = 80;
/** Matches `.hc-card.is-leaving` in habit-cards.css. */
export const LEAVE_MS = 180;

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Swipe a card right = done. Pointer events, so touch, pen and mouse behave
 * the same: the card follows the finger by `transform` only (nothing else on
 * the screen moves), rubber-bands a little to the left, and goes home when it
 * is let go short of the threshold. A vertical drag is the page's scroll and
 * is never taken. Under `prefers-reduced-motion` the card still follows the
 * pointer (direct manipulation), but it does not tilt, ease or fly out: it is
 * simply gone on release.
 *
 * The same `onDone` runs from the keyboard (Enter or ArrowRight on the focused
 * card) and from the Done button, so the swipe is never the only way.
 */
export function useSwipeDone(onDone: () => void) {
  const node = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(
    () => () => {
      stop.current?.();
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const card = node.current;
    if (!card || stop.current || timer.current) return;
    if (e.button != null && e.button > 0) return;
    if ((e.target as HTMLElement).closest?.("button, a, input, textarea"))
      return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let kind: "swipe" | "none" | null = null;
    let x = 0;
    let lastX = x0;
    let lastT = performance.now();
    let speed = 0;

    const place = (px: number) => {
      card.style.transform = px
        ? `translate3d(${px.toFixed(1)}px,0,0)${reduced() ? "" : ` rotate(${(px / 40).toFixed(2)}deg)`}`
        : "";
    };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!kind) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        kind = Math.abs(dx) > Math.abs(dy) ? "swipe" : "none";
        if (kind === "swipe") card.classList.add("is-dragging");
      }
      if (kind !== "swipe") return;
      if (ev.cancelable) ev.preventDefault();
      const now = performance.now();
      if (now > lastT) speed = (ev.clientX - lastX) / (now - lastT);
      lastX = ev.clientX;
      lastT = now;
      x = dx > 0 ? dx : dx * 0.15;
      place(x);
    };

    const end = (_ev: PointerEvent | null, reason: "up" | "cancel") => {
      stop.current = null;
      card.classList.remove("is-dragging");
      if (kind !== "swipe") return;
      // The speed is that of the last move; a hold before letting go ends it.
      if (performance.now() - lastT > FLICK_STALE_MS) speed = 0;
      const commit =
        reason === "up" &&
        (x >= SWIPE_DONE_AT || (x >= FLICK_AT && speed >= FLICK_PX_PER_MS));
      if (!commit) {
        place(0);
        return;
      }
      if (reduced()) {
        done.current();
        return;
      }
      card.classList.add("is-leaving");
      card.style.transform = "translate3d(120%,0,0) rotate(6deg)";
      timer.current = setTimeout(() => {
        timer.current = null;
        done.current();
      }, LEAVE_MS);
    };

    stop.current = pkTrack(move, end, e.pointerId);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      done.current();
    }
  };

  return { ref: node, onPointerDown, onKeyDown };
}
