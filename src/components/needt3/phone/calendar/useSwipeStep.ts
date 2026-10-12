"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";

import { pkTrack } from "../kit";
import { swipeStep } from "./model";

interface Press {
  id: number;
  x: number;
  y: number;
  /** Where the last move was: the release decides from it, not from the up event. */
  lx: number;
  ly: number;
  off: () => void;
}

const none = () => undefined;

/**
 * A sideways swipe that pages a week / a month (Mobile.jsx `mbSwipe`). It
 * decides once, on the release, from the last move: nothing follows the
 * finger and nothing is written per frame. A `pointercancel` (the browser
 * took the gesture for a scroll, a hold took the finger) never pages; a
 * second finger down while one is tracked is ignored; the listeners are gone
 * on release and on unmount. A tap that ends a swipe is swallowed, so the row
 * under it does not open.
 *
 * Spread the result on the element: `touch-action: pan-y` lets the page keep
 * its vertical scroll and hands the horizontal moves to the pointer stream.
 */
export function useSwipeStep(onStep: (k: -1 | 1) => void) {
  const press = useRef<Press | null>(null);
  const swiped = useRef(-Infinity);
  const step = useRef(onStep);
  step.current = onStep;

  useEffect(
    () => () => {
      press.current?.off();
      press.current = null;
    },
    []
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button != null && e.button > 0) return;
    if (press.current) return;
    const p: Press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      off: none,
    };
    press.current = p;
    p.off = pkTrack(
      (ev) => {
        p.lx = ev.clientX;
        p.ly = ev.clientY;
      },
      (_ev, reason) => {
        press.current = null;
        if (reason !== "up") return;
        const k = swipeStep(p.lx - p.x, p.ly - p.y);
        if (!k) return;
        swiped.current = performance.now();
        step.current(k);
      },
      e.pointerId
    );
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (performance.now() - swiped.current < 300) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const style: CSSProperties = { touchAction: "pan-y" };
  return { onPointerDown, onClickCapture, style };
}
