/**
 * Energy over the day by chronotype, pure. Used by the scheduler only when a
 * person has picked a chronotype (`EnergyProfile`, Pro, `energy_curve` flag)
 * and has not set energy hours by hand: their own hours always win.
 *
 * The shapes follow the usual circadian pattern: a first peak a few hours
 * after waking, an early-afternoon dip, a second smaller rise, then a decline.
 * Early types peak early, late types in the late afternoon and evening.
 */
import type { EnergyLevel } from "@/types/scheduling";

export const CHRONOTYPES = ["lark", "neutral", "owl"] as const;
export type Chronotype = (typeof CHRONOTYPES)[number];

/** [start, end) whole local hours and the energy then. */
type Band = [number, number, EnergyLevel];

const CURVES: Record<Chronotype, Band[]> = {
  lark: [
    [6, 10, "high"],
    [10, 12, "medium"],
    [12, 14, "low"],
    [14, 17, "medium"],
    [17, 21, "low"],
  ],
  neutral: [
    [9, 12, "high"],
    [12, 13, "medium"],
    [13, 15, "low"],
    [15, 18, "medium"],
    [18, 22, "low"],
  ],
  owl: [
    [10, 13, "medium"],
    [13, 15, "low"],
    [15, 20, "high"],
    [20, 23, "medium"],
  ],
};

export function isChronotype(value: unknown): value is Chronotype {
  return (
    typeof value === "string" &&
    (CHRONOTYPES as readonly string[]).includes(value)
  );
}

/** The energy at a local hour (0–23), or null outside the curve. */
export function chronotypeEnergy(
  hour: number,
  chronotype: Chronotype
): EnergyLevel | null {
  for (const [start, end, level] of CURVES[chronotype]) {
    if (hour >= start && hour < end) return level;
  }
  return null;
}

/** The whole day as bands, for clients that draw it. */
export function chronotypeCurve(chronotype: Chronotype) {
  return CURVES[chronotype].map(([start, end, energy]) => ({
    start,
    end,
    energy,
  }));
}
