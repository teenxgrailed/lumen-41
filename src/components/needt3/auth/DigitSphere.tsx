"use client";

import { useEffect, useRef } from "react";

import { startDigitSphere } from "@/lib/needt3/digit-sphere";

/**
 * The slowly turning globe of digits behind the sign-in form (owner request
 * 2026-11-14). Decoration only: not announced, not clickable. The drawing is
 * `@/lib/needt3/digit-sphere`; this only owns the canvas.
 *
 * Placement (docs/handoff/PORT.md rule 6, the ground is the ground): it is
 * drawn on the sky, under the glass card, so the card stays the one raised
 * object and the form never has digits behind its text at full strength. On a
 * wide screen the globe is centred behind the card, the frosted glass softens
 * it. On a narrow one it sits in the top third as a band above the form, on
 * the quiet end of the alpha ladder, and fades out before the fields.
 */
export function DigitSphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const run = startDigitSphere(el);
    return () => run.stop();
  }, []);
  return (
    <canvas
      ref={ref}
      className="auth-digit-sphere"
      aria-hidden="true"
      data-digit-sphere
    />
  );
}
