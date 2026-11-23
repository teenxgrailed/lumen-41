"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Calls `onSeen` once, the first time the element is really on screen: at
 * least `ratio` of it inside the viewport, the tab visible. A card that is
 * fetched, mounted off screen or in a hidden tab does not count; the day's two
 * cards are spent only on cards a person could read. `enabled` false stops
 * watching (a folded card, a card already answered).
 */
export function useWhenSeen(
  ref: RefObject<Element | null>,
  onSeen: () => void,
  { enabled = true, ratio = 0.6 }: { enabled?: boolean; ratio?: number } = {}
) {
  const cb = useRef(onSeen);
  cb.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    let done = false;
    let inView = false;
    const onVisible = () => fire();
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        inView =
          !!last && last.isIntersecting && last.intersectionRatio >= ratio;
        fire();
      },
      { threshold: [ratio] }
    );
    function cleanup() {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    }
    function fire() {
      if (done || !inView || document.visibilityState !== "visible") return;
      done = true;
      cleanup();
      cb.current();
    }
    io.observe(el);
    document.addEventListener("visibilitychange", onVisible);
    return cleanup;
  }, [ref, enabled, ratio]);
}
