"use client";

import { type RefObject, useEffect } from "react";

import { usePathname } from "next/navigation";

/**
 * Safari 26 tints its status-bar and bottom-toolbar areas from `theme-color`
 * and the `html` background, not from our fixed screen. So the page tells it
 * the colour that actually sits under each edge of the phone screen.
 *
 * The colours are CSS, not pixels: `phone-ground.css` registers
 * `--v3-edge-top` / `--v3-edge-bottom` as `<color>` properties on the phone
 * scope and re-points them per theme and per state (a sheet's scrim, the
 * pull-down's sky) with `:has()`. This hook only reads the computed values and
 * writes them: the top into every `theme-color` meta, the bottom into `html`.
 * It re-reads on route change, theme change and whenever a layer opens or
 * shuts. The static metas (`generateViewport`) stay as the fallback: if a
 * value is empty nothing is written, and cleanup restores what was there.
 */
/**
 * A computed `color-mix()` reads back as `color(srgb r g b)`; the browser bars
 * are safest with plain `rgb()`, so a resolved value is rewritten to it.
 */
export function toRgb(value: string): string {
  const m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!m) return value;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) =>
    Math.round(Math.min(1, Math.max(0, Number(n))) * 255)
  );
  return `rgb(${r}, ${g}, ${b})`;
}

export const EDGE_TOP_VAR = "--v3-edge-top";
export const EDGE_BOTTOM_VAR = "--v3-edge-bottom";

export function usePhoneEdgeTint(
  scopeRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  /** Anything that changes the colours without a DOM change we can see. */
  themeKey: string
) {
  const pathname = usePathname();
  useEffect(() => {
    const scope = scopeRef.current;
    if (!enabled || !scope) return undefined;
    const html = document.documentElement;
    const metas = Array.from(
      document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]'
      )
    );
    const savedMeta = metas.map((m) => m.getAttribute("content"));
    const savedBg = [
      html.style.getPropertyValue("background-color"),
      html.style.getPropertyPriority("background-color"),
    ];
    let top = "";
    let bottom = "";
    const apply = () => {
      const cs = getComputedStyle(scope);
      const t = toRgb(cs.getPropertyValue(EDGE_TOP_VAR).trim());
      const b = toRgb(cs.getPropertyValue(EDGE_BOTTOM_VAR).trim());
      if (t && t !== top) {
        top = t;
        metas.forEach((m) => m.setAttribute("content", t));
      }
      if (b && b !== bottom) {
        bottom = b;
        // `!important`: phone-ground.css paints html with it.
        html.style.setProperty("background-color", b, "important");
      }
    };
    let raf = 0;
    const soon = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };
    apply();
    // A sheet, the pull-down and the scrim open and shut by class / attribute.
    const mo = new MutationObserver(soon);
    mo.observe(scope, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-pk-pull", "data-theme"],
    });
    return () => {
      mo.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      metas.forEach((m, i) => {
        if (savedMeta[i] !== null) m.setAttribute("content", savedMeta[i]);
      });
      if (savedBg[0])
        html.style.setProperty("background-color", savedBg[0], savedBg[1]);
      else html.style.removeProperty("background-color");
    };
  }, [scopeRef, enabled, pathname, themeKey]);
}
