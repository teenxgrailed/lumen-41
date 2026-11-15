"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { NeedtAppIcon } from "../wordmark/AppIcon";

// Layout effect on the client (no empty frame when a second one takes over),
// plain effect on the server (where layout effects only warn).
const useSyncEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * One shared count of mounted loading screens. A route change can unmount one
 * and mount another in the same turn (a fallback, then the real cover); the
 * newcomer is marked `data-continued` and does not fade in again. A screen
 * that was up within `GRACE_MS` counts too.
 */
const GRACE_MS = 400;
let mounted = 0;
let lastGone = -Infinity;

/** Test seam. */
export function resetLoadingScreens() {
  mounted = 0;
  lastGone = -Infinity;
}

/**
 * THE loading screen: only the Needt logo (the app icon, the one the sign-in
 * header shows) in the middle of the app background, fading in softly and
 * breathing gently (opacity and scale 0.98 to 1 over about 2.4 s). No word, no
 * fill, no text. Reduced motion: still, with no animation.
 *
 * Shown only for real waits: a new-version reload and the Budget frame. A
 * place switch has its skeleton (`RouteLoading`), never this.
 *
 * `cover` lays it over its (positioned) parent with the page ground, for a
 * frame that loads in place; `fixed` covers the whole window.
 */
export function NeedtLoading({
  cover,
  fixed,
}: {
  cover?: boolean;
  fixed?: boolean;
}) {
  const reduced = useNeedtReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  useSyncEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const now = performance.now();
    if (mounted > 0 || now - lastGone < GRACE_MS) el.dataset.continued = "";
    mounted += 1;
    return () => {
      mounted = Math.max(0, mounted - 1);
      lastGone = performance.now();
    };
  }, []);

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
    >
      <span className="nl-logo" aria-hidden="true">
        <NeedtAppIcon size={64} />
      </span>
    </div>
  );
}
