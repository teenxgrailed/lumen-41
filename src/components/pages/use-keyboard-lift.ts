"use client";

import { useEffect, useState } from "react";

import { type BarOffset, NO_KEYBOARD, barOffset } from "./phone-bar/bar-logic";

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport, in
 * px (0 when it is down). Fixed elements stay put when a phone keyboard
 * opens, so anything that must ride above it (the "/" command sheet) lifts
 * itself by this. The reading is the editing bar's (`barOffset`): the
 * visual viewport's overshoot while the page is dragged is clamped, a zoomed
 * page keeps the last answer, and the keyboard counts as down only once it
 * covers well under the threshold that counted it as up.
 */
export function keyboardLiftOf(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop: number
) {
  return barOffset({ innerHeight, vvHeight, vvOffsetTop }).lift;
}

export function useKeyboardLift(): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let last: BarOffset = NO_KEYBOARD;
    // Straight from the event, not a frame later: a frame of lag is what made
    // the lifted sheet trail the page while it scrolled.
    const update = () => {
      last = barOffset(
        {
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffsetTop: vv.offsetTop,
          scale: vv.scale,
        },
        last
      );
      setLift(last.lift);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return lift;
}
