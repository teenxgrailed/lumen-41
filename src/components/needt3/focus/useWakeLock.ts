"use client";

import { useEffect } from "react";

/**
 * Keeps the screen awake while `active` (the Screen Wake Lock API). The
 * browser drops the lock whenever the tab is hidden, so it is asked for again
 * when the tab comes back. Where the API is missing (older Safari, Firefox
 * before 126) or the request is refused (low battery), nothing happens and
 * the screen sleeps on the system's own timer: the session itself does not
 * depend on it, the clock is the server's.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock)
      return undefined;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* refused: the system timer rules */
      }
    };
    const back = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", back);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", back);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
