/**
 * Home's day, energy-aware: tasks that have an hour keep it; the ones with no
 * hour of their own are ordered by weight for the time of day (`energyOrder`).
 */
import { type EnergyHours, energyOrder } from "@/lib/needt3/energy";
import type { V3Task } from "@/lib/needt3/map";

import { hourAt } from "./derive";

export function energyDay(
  day: readonly V3Task[],
  today: string,
  nowHour: number,
  hours: EnergyHours
): V3Task[] {
  const timed = day.filter((t) => hourAt(t, today) != null);
  const loose = day.filter((t) => hourAt(t, today) == null);
  // untimed tasks stay after the timed ones, as the day lists them
  return [...timed, ...energyOrder(loose, nowHour, hours)];
}
