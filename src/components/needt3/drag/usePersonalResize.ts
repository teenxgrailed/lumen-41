"use client";

/* Drag the bottom edge of a personal time band to change when it ends.
 *
 * The move is the task drag (`useDrag`: lift, drop on the grid). A resize has
 * no landing place, so it is the smaller gesture beside it, held to the same
 * rules (PORT.md §5): press, travel 4px before it counts, one rAF per pointer
 * stream, the band's height written straight to the node (never React state
 * per pixel), nothing measured in `pointermove`, snapped to the quarter hour
 * by the drag's own snap. Escape puts it back. On release the host decides
 * (ask first for a repeating block, write, or give the height back).
 */
import { useCallback, useEffect, useRef } from "react";

import { DRAG_THRESHOLD_PX } from "./geometry";
import { PERSONAL_MIN_MINUTES, resizeDeltaHours } from "./personal-drop";

export interface ResizeRequest {
  blockId: string;
  /** Snapped hours the end moved; never 0. */
  deltaHours: number;
  /** Put the band back at the height it had before the pull. */
  revert: () => void;
}

export interface ResizeTarget {
  blockId: string;
  /** Pixels per hour of the grid the band is drawn on. */
  hourH: number;
}

export type ResizeProps = (target: ResizeTarget) => {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
};

interface Live {
  blockId: string;
  hourH: number;
  el: HTMLElement;
  scope: Element | null;
  /** The inline height before the pull, and the rendered height in px. */
  height: string;
  h0: number;
  y0: number;
  y: number;
  delta: number;
  started: boolean;
}

const SWALLOW_MS = 350;

export function usePersonalResize(onResize: (request: ResizeRequest) => void) {
  const live = useRef<Live | null>(null);
  const raf = useRef(0);
  const swallowUntil = useRef(0);
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;

  useEffect(() => {
    /* One frame of the hand: where the end is now. */
    function paint(s: Live) {
      const dy = s.y - s.y0;
      if (!s.started) {
        if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        s.started = true;
        s.scope?.setAttribute("data-pb-resizing", "");
      }
      s.delta = resizeDeltaHours(dy, s.hourH);
      const floor = (PERSONAL_MIN_MINUTES / 60) * s.hourH;
      s.el.style.height = `${Math.max(floor, s.h0 + s.delta * s.hourH)}px`;
    }

    function tick() {
      raf.current = 0;
      const s = live.current;
      if (s) paint(s);
    }

    function finish(commit: boolean, y?: number) {
      const s = live.current;
      live.current = null;
      if (raf.current) {
        window.cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
      if (!s) return;
      s.scope?.removeAttribute("data-pb-resizing");
      if (commit && y != null) {
        s.y = y;
        paint(s);
      }
      if (!s.started) return;
      swallowUntil.current = performance.now() + SWALLOW_MS;
      const revert = () => {
        s.el.style.height = s.height;
      };
      if (commit && s.delta !== 0) {
        resizeRef.current({
          blockId: s.blockId,
          deltaHours: s.delta,
          revert,
        });
      } else revert();
    }

    function move(e: PointerEvent) {
      const s = live.current;
      if (!s) return;
      if (s.started && e.cancelable) e.preventDefault();
      s.y = e.clientY;
      if (!raf.current) raf.current = window.requestAnimationFrame(tick);
    }
    const up = (e: PointerEvent) => finish(true, e.clientY);
    const cancel = () => finish(false);
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && live.current) {
        e.stopPropagation();
        finish(false);
      }
    }
    /* A pull is not a click on the band it started from. */
    function click(e: MouseEvent) {
      if (performance.now() < swallowUntil.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", cancel);
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      live.current?.scope?.removeAttribute("data-pb-resizing");
      live.current = null;
    };
  }, []);

  /* Spread onto the band's bottom-edge handle. */
  const resizeProps = useCallback<ResizeProps>(
    ({ blockId, hourH }) => ({
      onPointerDown: (e) => {
        if (e.button !== 0 || e.pointerType === "touch") return;
        // the handle belongs to the resize; the band's own lift must not arm
        e.stopPropagation();
        const el = e.currentTarget.closest<HTMLElement>("[data-personal-band]");
        if (!el) return;
        live.current = {
          blockId,
          hourH,
          el,
          scope: el.closest(".needt-v3"),
          height: el.style.height,
          h0: el.offsetHeight,
          y0: e.clientY,
          y: e.clientY,
          delta: 0,
          started: false,
        };
      },
    }),
    []
  );

  return { resizeProps };
}
