"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { type Sample, pushSample, velocity } from "@/lib/needt3/gesture";
import { type Spring, springStep } from "@/lib/needt3/spring";

import { frameWriter, pkTrack } from "../kit/pointer";
import { pkClamp, pkReduced } from "../kit/util";
import { edgeIntent, edgeProgress, edgeRelease, startsAtEdge } from "./logic";

interface Drag {
  pointerId: number;
  x0: number;
  y0: number;
  kind: "back" | "none" | null;
  samples: Sample[];
}

interface SlideState {
  p: Spring;
  target: number;
  raf: number;
  last: number;
  width: number;
  left: number;
  leaving: boolean;
  ended: number;
  drag: Drag | null;
  untrack: (() => void) | null;
}

/** A click that ends a swipe is not a tap. */
const SWALLOW_MS = 300;

/**
 * The reader's slide (phone-docs.jsx `PdDocReader` 1008–1100): the page opens
 * by springing in from the right, goes back by springing out, and follows a
 * finger that starts in the left edge strip 1:1. `p` is how far the page sits
 * to the right (0 open, 1 gone); it is written to a `transform` through the
 * ref (no React state per frame) and the finger's stream paints once per frame.
 *
 * A pointercancel (or a hold that took the finger) never goes back; a second
 * pointerdown while one is tracked is ignored; the listeners are gone when the
 * swipe ends and on unmount. The width and left edge are measured on mount and
 * on resize, never in the pointer path.
 */
export function useReaderSlide({
  rootRef,
  onGone,
  enabled = true,
}: {
  rootRef: RefObject<HTMLElement | null>;
  /** The page has left: the caller goes back to the list. */
  onGone: () => void;
  /** false while typing, a sheet or a menu is up (no edge swipe then). */
  enabled?: boolean;
}) {
  const S = useRef<SlideState>({
    p: { x: 1, v: 0 },
    target: 0,
    raf: 0,
    last: 0,
    width: 0,
    left: 0,
    leaving: false,
    ended: Number.NEGATIVE_INFINITY,
    drag: null,
    untrack: null,
  }).current;
  const frame = useRef(frameWriter()).current;
  const gone = useRef(onGone);
  gone.current = onGone;
  const on = useRef(enabled);
  on.current = enabled;

  /** While the page moves, its glass rests (motion.css P7): one blur at most. */
  const mark = useCallback(
    (on: boolean) => {
      rootRef.current?.toggleAttribute("data-pd-sliding", on);
    },
    [rootRef]
  );

  const paint = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const x = Math.max(0, S.p.x);
    el.style.transform =
      x > 0.0005 ? `translate3d(${(x * S.width).toFixed(1)}px,0,0)` : "";
  }, [rootRef, S]);

  const run = useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    mark(true);
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - S.last) / 1000);
      S.last = now;
      const still = springStep(S.p, S.target, dt, 260, 0.92);
      paint();
      if (still) {
        S.p.x = S.target;
        S.p.v = 0;
        S.raf = 0;
        paint();
        mark(false);
        if (S.target >= 1) gone.current();
        return;
      }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [mark, paint, S]);

  const go = useCallback(
    (target: number, vel?: number) => {
      S.target = target;
      if (vel != null) S.p.v = vel;
      if (pkReduced()) {
        cancelAnimationFrame(S.raf);
        S.raf = 0;
        S.p.x = target;
        S.p.v = 0;
        paint();
        mark(false);
        if (target >= 1) gone.current();
        return;
      }
      run();
    },
    [mark, paint, run, S]
  );

  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    S.width = el.offsetWidth;
    S.left = el.getBoundingClientRect().left;
  }, [rootRef, S]);

  // Open: spring in from the right (a snap under reduced motion).
  useLayoutEffect(() => {
    const el = rootRef.current;
    measure();
    S.leaving = false;
    S.p.x = pkReduced() ? 0 : 1;
    S.p.v = 0;
    paint();
    go(0);
    return () => {
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      frame.cancel();
      S.untrack?.();
      S.untrack = null;
      S.drag = null;
      el?.classList.remove("is-dragging");
      el?.toggleAttribute("data-pd-sliding", false);
    };
    // mount only: the spring state lives in the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /** Go back: spring out, then `onGone`. */
  const back = useCallback(() => {
    if (S.leaving) return;
    S.leaving = true;
    go(1);
  }, [go, S]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button > 0 || S.leaving || S.drag || !on.current) return;
      if (!startsAtEdge(e.clientX, S.left)) return;
      const d: Drag = {
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        kind: null,
        samples: [[performance.now(), e.clientX]],
      };
      S.drag = d;
      S.untrack = pkTrack(
        (ev) => {
          const dx = ev.clientX - d.x0;
          const dy = ev.clientY - d.y0;
          pushSample(d.samples, performance.now(), ev.clientX);
          if (!d.kind) {
            d.kind = edgeIntent(dx, dy);
            if (!d.kind) return;
            if (d.kind === "back") {
              cancelAnimationFrame(S.raf);
              S.raf = 0;
              mark(true);
              rootRef.current?.classList.add("is-dragging");
            }
          }
          if (d.kind !== "back") return;
          if (ev.cancelable) ev.preventDefault();
          S.p.x = edgeProgress(dx, S.width);
          S.p.v = 0;
          frame.schedule(paint);
        },
        (_ev, reason) => {
          S.untrack = null;
          S.drag = null;
          frame.cancel();
          rootRef.current?.classList.remove("is-dragging");
          if (d.kind !== "back") return;
          S.ended = performance.now();
          // the last move decides, not the up event's own coordinates
          const v = velocity(d.samples);
          const vel = pkClamp((v * 1000) / (S.width || 1), -8, 8);
          if (edgeRelease(reason, S.p.x, v) === "back") {
            S.p.v = vel;
            back();
          } else go(0, reason === "up" ? vel : 0);
        },
        e.pointerId
      );
    },
    [back, frame, go, mark, paint, rootRef, S]
  );

  /** Capture-phase click guard: the click a swipe ends with is not a tap. */
  const onClickCapture = useCallback(
    (e: Event) => {
      if (performance.now() - S.ended < SWALLOW_MS) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [S]
  );

  // Native listeners on the root, not React props: the editor is moved into
  // the page from a portal (DocumentFace), and a portal's events bubble to its
  // React parent, not through this DOM ancestor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [onPointerDown, onClickCapture, rootRef]);

  return { back };
}
