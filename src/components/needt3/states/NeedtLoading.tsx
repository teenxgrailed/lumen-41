"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

import { DEFAULT_APP_ICON, appIconSrc } from "@/lib/needt3/app-icon";

import { useAppIcon } from "@/store/app-icon";

import { NeedtAppIcon } from "../wordmark/AppIcon";

// Layout effect on the client (no empty frame when a second one takes over),
// plain effect on the server (where layout effects only warn).
const useSyncEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * One shared count of mounted loading screens. A route change can unmount one
 * and mount another in the same turn (a fallback, then the real cover); the
 * newcomer is marked `data-continued` and does not fade in again. A screen
 * that was up within `GRACE_MS` counts too, except the very same node coming
 * back (a Strict Mode remount is not a hand-over).
 */
const GRACE_MS = 400;
let mounted = 0;
let lastGone = -Infinity;
let lastNode: HTMLElement | null = null;

/** Test seam. */
export function resetLoadingScreens() {
  mounted = 0;
  lastGone = -Infinity;
  lastNode = null;
}

/**
 * THE loading screen: only the Needt logo (the app icon, the one the sign-in
 * header shows) in the middle of the app background, fading in softly and
 * breathing gently (opacity and scale 0.98 to 1 over about 2.4 s). No word, no
 * fill, no text. Reduced motion: still, with no animation.
 *
 * Mount it only inside a hydrated app: the chosen icon comes from the store
 * that settings fill in, so before that it shows the default icon first.
 *
 * The icon is fetched eagerly. If the chosen file fails, the default icon is
 * drawn; if that fails too, a plain tile in the text colour. It breathes only
 * once something is on screen, so an empty box never breathes.
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
  // 0: the chosen icon, 1: the default icon, 2: a plain tile.
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [loaded, setLoaded] = useState(false);

  // The default icon is no fallback for itself: straight to the tile.
  const fail = () =>
    setStage((s) =>
      s === 0 && useAppIcon.getState().id !== DEFAULT_APP_ICON ? 1 : 2
    );

  useSyncEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const now = performance.now();
    if (mounted > 0 || (el !== lastNode && now - lastGone < GRACE_MS))
      el.dataset.continued = "";
    mounted += 1;
    // An icon that was already in the HTML finished before React was listening.
    const img = el.querySelector("img");
    if (img && img.complete) {
      if (img.naturalWidth > 0) setLoaded(true);
      // ...and one that failed before React was listening.
      else fail();
    }
    return () => {
      mounted = Math.max(0, mounted - 1);
      lastGone = performance.now();
      lastNode = el;
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
      <span
        className={"nl-logo" + (loaded || stage === 2 ? " nl-loaded" : "")}
        aria-hidden="true"
      >
        {stage === 2 ? (
          <span className="nl-tile" />
        ) : (
          <NeedtAppIcon
            size={64}
            eager
            src={stage === 1 ? appIconSrc(DEFAULT_APP_ICON) : undefined}
            onLoad={() => setLoaded(true)}
            onError={fail}
          />
        )}
      </span>
    </div>
  );
}
