"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import {
  acquireLoadingClock,
  fillFor,
  fillInsetPct,
  releaseLoadingClock,
} from "./needtLoadingFill";

// Layout effect on the client (no empty frame when a second word takes over),
// plain effect on the server (where layout effects only warn).
const useSyncEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * THE loading screen: the word "Needt" in the display face, grey, filling with
 * the full text colour from left to right by real progress. Nothing else is on
 * it. Pass `progress` (0..1) when the load reports it; leave it out and the
 * fill eases toward 90% and slows down, and only completes when the caller
 * unmounts it or passes 1. Reduced motion: a still grey word, no fill, no
 * transition; the swap to the page happens when loading is done.
 *
 * `cover` lays it over its (positioned) parent with the page ground, for a
 * frame that loads in place; `fixed` covers the whole window. Neither is
 * needed in a page slot, where it simply centres itself.
 */
export function NeedtLoading({
  progress,
  cover,
  fixed,
}: {
  progress?: number | undefined;
  cover?: boolean;
  fixed?: boolean;
}) {
  const reduced = useNeedtReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  // Known progress is drawn from props; eased progress is written straight to
  // the node each frame, so a wait does not re-render the screen 60 times a
  // second. The clock is shared (see `acquireLoadingClock`).
  useSyncEffect(() => {
    const el = root.current;
    if (!el || reduced || progress !== undefined) return undefined;
    const started = acquireLoadingClock(performance.now());
    const paint = (now: number) => {
      const fill = fillFor({ progress: undefined, elapsedMs: now - started });
      el.style.setProperty("--nl-inset", `${fillInsetPct(fill)}%`);
      el.dataset.fill = fill.toFixed(3);
    };
    paint(performance.now());
    let frame = 0;
    const tick = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      releaseLoadingClock();
    };
  }, [progress, reduced]);

  const initial = reduced ? 0 : fillFor({ progress, elapsedMs: 0 });
  const style = { "--nl-inset": `${fillInsetPct(initial)}%` } as CSSProperties;

  return (
    <div
      ref={root}
      className={
        "nl-root" +
        (fixed ? " nl-fixed" : cover ? " nl-cover" : "") +
        (reduced ? " nl-still" : "")
      }
      role="status"
      aria-live="polite"
      aria-label="Loading"
      data-needt-loading=""
      data-fill={initial.toFixed(3)}
      style={style}
    >
      <span className="nl-word" aria-hidden="true">
        <span className="nl-base">Needt</span>
        <span className="nl-fill">Needt</span>
      </span>
    </div>
  );
}
