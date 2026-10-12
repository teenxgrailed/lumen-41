"use client";

import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { newDate } from "@/lib/date-utils";

import {
  type PkSide,
  type SkyMood,
  pkInverse,
  pkPlateClass,
  pkSkyMood,
} from "./util";

/** The theme side the phone wears, "light" | "dark". */
export const PkTheme = createContext<PkSide>("light");

export const usePkSide = () => useContext(PkTheme);
export const usePkInverse = () => pkInverse(usePkSide());
export const usePkPlate = () => pkPlateClass(usePkSide());

function readSide(): PkSide {
  const el = document.querySelector(".needt-v3");
  return el?.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * Wrap the phone once. It follows the `data-theme` the v3 frame carries
 * (System, Light, Dark and Time all end in one of the two), so a theme change
 * reaches every plate without a prop.
 */
export function PkThemeRoot({ children }: PropsWithChildren) {
  const [side, setSide] = useState<PkSide>("light");
  useEffect(() => {
    const el = document.querySelector(".needt-v3");
    setSide(readSide());
    if (!el || typeof MutationObserver !== "function") return undefined;
    const mo = new MutationObserver(() => setSide(readSide()));
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return <PkTheme.Provider value={side}>{children}</PkTheme.Provider>;
}

const QUARTER_HOUR = 15 * 60 * 1000;

/**
 * The sky's mood now, re-read once a quarter hour while mounted (one timer
 * per host, no frames), so a plate left open crosses into golden hour / dusk.
 * The first render (server and hydration) has no hour and wears the day's own
 * mood, so the markup matches; the real hour lands in the first effect.
 */
export function usePkSkyMood(): { mood: SkyMood; dark: boolean } {
  const side = usePkSide();
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(newDate().getHours());
    const id = window.setInterval(
      () => setHour(newDate().getHours()),
      QUARTER_HOUR
    );
    return () => window.clearInterval(id);
  }, []);
  return {
    mood: hour === null ? null : pkSkyMood(side, hour),
    dark: side === "dark",
  };
}
