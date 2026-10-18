/**
 * Energy-aware order, pure. A task's `energy` says how heavy it is; the
 * person's high-energy hours (Settings, Your day; the morning by default) say
 * when heavy work goes. Home reads this to order what has no hour of its own.
 * The scheduler's slot scoring reads the same hours (`SlotScorer`).
 */
import type { V3Energy, V3Task } from "./map";

export interface EnergyHours {
  /** Whole hours, 0–24: [start, end). */
  start: number;
  end: number;
}

/** The morning, until the person says otherwise. */
export const DEFAULT_HIGH_ENERGY: EnergyHours = { start: 9, end: 12 };

/** The saved hours, or the default when none or unusable are saved. */
export function highEnergyHours(
  saved:
    | { highEnergyStart?: number | null; highEnergyEnd?: number | null }
    | null
    | undefined
): EnergyHours {
  const s = saved?.highEnergyStart;
  const e = saved?.highEnergyEnd;
  return typeof s === "number" && typeof e === "number" && e > s
    ? { start: s, end: e }
    : DEFAULT_HIGH_ENERGY;
}

export const inHighEnergy = (hour: number, hours: EnergyHours) =>
  hour >= hours.start && hour < hours.end;

const WEIGHT: Record<V3Energy, number> = { high: 0, medium: 1, low: 2 };

/** A task without a stated energy counts as medium. */
export const energyOf = (t: Pick<V3Task, "energy">): V3Energy =>
  t.energy ?? "medium";

/**
 * Orders tasks that have no hour of their own for `nowHour`: in the high-energy
 * hours the heavy ones first, outside them the light ones first so heavy work
 * waits for the next good stretch. Stable: ties keep the order given.
 */
export function energyOrder<T extends Pick<V3Task, "energy">>(
  list: readonly T[],
  nowHour: number,
  hours: EnergyHours
): T[] {
  const heavyFirst = inHighEnergy(nowHour, hours) || nowHour < hours.start;
  const key = (t: T) =>
    heavyFirst ? WEIGHT[energyOf(t)] : -WEIGHT[energyOf(t)];
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => key(a.t) - key(b.t) || a.i - b.i)
    .map((x) => x.t);
}

/** The choices "High-energy hours" offers in Your day, as [key, label]. */
export const ENERGY_PRESETS: readonly (readonly [string, string])[] = [
  ["6-9", "Early morning \u00b7 06\u201309"],
  ["9-12", "Morning \u00b7 09\u201312"],
  ["10-13", "Late morning \u00b7 10\u201313"],
  ["13-16", "Afternoon \u00b7 13\u201316"],
  ["18-21", "Evening \u00b7 18\u201321"],
];

const two = (n: number) => String(n).padStart(2, "0");

/** The select's options with the saved hours added when they are not a preset. */
export function energyOptions(hours: EnergyHours) {
  const key = energyKey(hours);
  return ENERGY_PRESETS.some(([k]) => k === key)
    ? ENERGY_PRESETS
    : [
        ...ENERGY_PRESETS,
        [
          key,
          `Custom \u00b7 ${two(hours.start)}\u2013${two(hours.end)}`,
        ] as const,
      ];
}

export const energyKey = (h: EnergyHours) => `${h.start}-${h.end}`;

/** "9-12" -> the two columns, or null for anything else. */
export function energyFromKey(key: string) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  return end > start && end <= 24
    ? { highEnergyStart: start, highEnergyEnd: end }
    : null;
}
