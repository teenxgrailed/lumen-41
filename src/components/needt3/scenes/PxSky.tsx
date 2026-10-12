"use client";

import {
  type CSSProperties,
  type MutableRefObject,
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type SkyClouds,
  type SkyEngine,
  type SkyHorizon,
  startSky,
} from "./sky-engine";

let grainUrl: string | null = null;

/** Paper grain: one static 128px tile, built once and shared. */
function paperGrain(): string {
  if (grainUrl !== null) return grainUrl;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    if (!x) return (grainUrl = "");
    const im = x.createImageData(128, 128);
    let s = 99;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = s >>> 24;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    grainUrl = c.toDataURL("image/png");
  } catch {
    grainUrl = "";
  }
  return grainUrl;
}

export interface PxSkyProps {
  /** Which of four cloud layouts: a, b, c or d. */
  variant?: "a" | "b" | "c" | "d";
  intensity?: number;
  /** Clouds thin around the pointer (and a finger). Default true. */
  interactive?: boolean;
  horizon?: SkyHorizon;
  clouds?: SkyClouds;
  /** "promo": five layered clouds and a sun glow, for the small upgrade card. */
  scene?: "promo";
  radius?: number;
  /** Pin a mood name for this sky (e.g. the phone's time of day). */
  mood?: string;
  /** Overrides the theme read from the nearest `[data-theme]`. */
  dark?: boolean;
  /** No frames while true (a closed or dragged layer); the last frame stays. */
  parked?: boolean;
  /** Receives `{ set, park, stop }`. */
  engine?: MutableRefObject<SkyEngine | null>;
  /** A lower frame rate for an accent sky (the phone's: 15). */
  fps?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The printed sky: one canvas for the clouds, one for the halftone dots, a
 * grain layer, and whatever children sit on it. The renderer runs outside
 * React (one rAF, no state per frame); this component only mounts and unmounts
 * it and forwards the few props that can change in place.
 */
export function PxSky({
  variant,
  intensity,
  interactive,
  horizon = "cloudsea",
  clouds,
  scene,
  radius,
  mood,
  dark,
  parked,
  engine,
  fps,
  className,
  style,
  children,
}: PropsWithChildren<PxSkyProps>) {
  const root = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const dv = useRef<HTMLCanvasElement>(null);
  const eng = useRef<(SkyEngine & { made?: string }) | null>(null);
  const live = useRef({ mood, dark, parked });
  live.current = { mood, dark, parked };
  const [grain, setGrain] = useState("");
  useEffect(() => setGrain(paperGrain()), []);

  useEffect(() => {
    if (!root.current || !cv.current || !dv.current) return undefined;
    const L = live.current;
    const e: SkyEngine & { made?: string } = startSky(
      root.current,
      cv.current,
      dv.current,
      {
        variant,
        intensity,
        interactive,
        horizon,
        clouds,
        scene,
        fps,
        mood: L.mood || undefined,
        dark: L.dark,
        parked: L.parked,
      }
    );
    eng.current = e;
    e.made = `${L.mood || ""}|${L.dark}`;
    if (engine) engine.current = e;
    return () => {
      e.stop();
      eng.current = null;
      if (engine && engine.current === e) engine.current = null;
    };
  }, [variant, intensity, interactive, horizon, clouds, scene, fps, engine]);

  /* mood / dark change in place (no remount); parked starts / stops frames. */
  useEffect(() => {
    const e = eng.current;
    const k = `${mood || ""}|${dark}`;
    if (e && e.made !== k) {
      e.made = k;
      e.set(mood || undefined, dark);
    }
  }, [mood, dark]);
  useEffect(() => {
    if (eng.current) eng.current.park(!!parked);
  }, [parked]);

  return (
    <div
      ref={root}
      className={"px-sky" + (className ? " " + className : "")}
      data-px-sky={variant || "a"}
      data-px-horizon={horizon}
      style={{ borderRadius: radius || 0, ...style }}
    >
      <canvas ref={cv} className="px-canvas" aria-hidden="true" />
      <canvas ref={dv} className="px-dotscreen" aria-hidden="true" />
      <div
        className="px-grain"
        aria-hidden="true"
        style={{ backgroundImage: grain ? `url(${grain})` : undefined }}
      />
      {children != null ? <div className="px-content">{children}</div> : null}
    </div>
  );
}
