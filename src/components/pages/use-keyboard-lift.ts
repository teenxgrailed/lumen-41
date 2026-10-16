"use client";

import { useEffect, useState } from "react";

/** Below this the visual viewport only moved with the browser's own bars. */
const KEYBOARD_MIN = 80;

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport, in
 * px (0 when it is down). Fixed elements stay put when a phone keyboard
 * opens, so anything that must ride above it (the editing toolbar, the
 * block sheet) lifts itself by this.
 */
export function keyboardLiftOf(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop: number
) {
  const lift = Math.max(0, Math.round(innerHeight - vvHeight - vvOffsetTop));
  return lift >= KEYBOARD_MIN ? lift : 0;
}

export function useKeyboardLift(): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setLift(keyboardLiftOf(window.innerHeight, vv.height, vv.offsetTop))
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return lift;
}
