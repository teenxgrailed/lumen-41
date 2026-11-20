"use client";

import { type RefObject, useEffect } from "react";

/**
 * How much of the bottom of the screen the on-screen keyboard covers, from the
 * visual viewport: the layout viewport keeps its height on iOS, the visual one
 * shrinks (and may scroll). Anything under 80px is browser chrome, not a
 * keyboard.
 */
export function pkKeyboardInset(vv: {
  height: number;
  offsetTop: number;
  innerHeight: number;
  /** Gap between the sheet layers bottom edge and the windows (the layer may sit inside the screen). */
  below?: number;
}): number {
  const covered = vv.innerHeight - (vv.height + vv.offsetTop);
  if (covered <= 80) return 0;
  return Math.max(0, Math.round(covered - (vv.below ?? 0)));
}

/**
 * Writes `--pk-kb` (px) on a sheet layer while it is open, so the sheet rises
 * with the keyboard instead of sitting under it. Only a custom property is
 * written, once per animation frame; the sheet's own CSS reads it. Shut: 0.
 */
export function usePkKeyboard(
  layer: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    const el = layer.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!el || !vv || !active) return undefined;
    let raf = 0;
    const write = () => {
      raf = 0;
      const kb = pkKeyboardInset({
        height: vv.height,
        offsetTop: vv.offsetTop,
        innerHeight: window.innerHeight,
        below: Math.max(
          0,
          window.innerHeight - el.getBoundingClientRect().bottom
        ),
      });
      el.style.setProperty("--pk-kb", `${kb}px`);
      el.toggleAttribute("data-pk-kb", kb > 0);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    write();
    vv.addEventListener("resize", queue);
    vv.addEventListener("scroll", queue);
    return () => {
      vv.removeEventListener("resize", queue);
      vv.removeEventListener("scroll", queue);
      cancelAnimationFrame(raf);
      el.style.removeProperty("--pk-kb");
      el.removeAttribute("data-pk-kb");
    };
  }, [layer, active]);
}
