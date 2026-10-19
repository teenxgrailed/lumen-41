"use client";

import { type RefObject, useEffect } from "react";

import { usePathname } from "next/navigation";

/**
 * An installed iOS app can end up with a layout viewport shorter than the
 * display (by the top inset, ~60 pt): `position: fixed; inset: 0` and `dvh`
 * then both stop above the bottom, and the screen's fog, dock and ground end
 * with them while the page colour shows below. It appears after some
 * navigations and survives a reload (the viewport, not the page, is wrong).
 *
 * The webview itself is still the whole display, so the phone scope is given
 * the display's height explicitly when the app is standalone, portrait and
 * the viewport is short by a few dozen points. Anything else (a browser tab,
 * the keyboard up, landscape, a healthy viewport) leaves the CSS in charge.
 */
export const MAX_SHORT_PX = 120;
export const MIN_SHORT_PX = 8;

export function fullHeightFor(env: {
  standalone: boolean;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
}): number | null {
  if (!env.standalone || env.innerHeight < env.innerWidth) return null;
  const full = Math.max(env.screenWidth, env.screenHeight);
  const short = full - env.innerHeight;
  return short > MIN_SHORT_PX && short < MAX_SHORT_PX ? full : null;
}

export function usePhoneFullHeight(
  scopeRef: RefObject<HTMLDivElement | null>,
  enabled: boolean
) {
  const pathname = usePathname();
  useEffect(() => {
    const scope = scopeRef.current;
    if (!enabled || !scope) return undefined;
    const sync = () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const full = fullHeightFor({
        standalone,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
      });
      if (full === null) scope.style.removeProperty("height");
      else scope.style.setProperty("height", `${full}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
      scope.style.removeProperty("height");
    };
  }, [scopeRef, enabled, pathname]);
}
