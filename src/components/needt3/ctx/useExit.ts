"use client";

import { useEffect, useState } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Keeps a closing surface mounted for its exit animation (prototype
 * motion.js): render while `mounted`, add `is-leaving` while `leaving`.
 * Under reduced motion it unmounts at once. `ms` must match the CSS exit.
 */
export function useExit(open: boolean, ms = 130): [boolean, boolean] {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (window.matchMedia?.(REDUCED).matches) {
      setMounted(false);
      setLeaving(false);
      return undefined;
    }
    setLeaving(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);

  return [mounted || open, leaving && !open];
}
