"use client";

import { PxSky } from "@/components/needt3/scenes/PxSky";

/** Idle time before the sky stops drifting (the landing uses 12 s). */
export const OB3_SKY_REST_MS = 120_000;

/**
 * The app's own printed sky, twice: a day sky and a night sky stacked, the
 * night one fading in (0.8 s, CSS) while Needt plans, for the gift and while
 * it opens. Both drift; both stop after two idle minutes.
 */
export function Ob3Sky() {
  const small = typeof window !== "undefined" && window.innerWidth < 760;
  const fps = small ? 24 : 30;
  return (
    <div className="ob3-sky has-engine" aria-hidden="true">
      <div className="ob3-px day">
        <PxSky
          variant="a"
          horizon="cloudsea"
          interactive
          mood="lavender"
          dark={false}
          fps={fps}
          restMs={OB3_SKY_REST_MS}
        />
      </div>
      <div className="ob3-px night">
        <PxSky
          variant="a"
          horizon="cloudsea"
          interactive
          mood="night"
          dark
          fps={fps}
          restMs={OB3_SKY_REST_MS}
        />
      </div>
    </div>
  );
}
