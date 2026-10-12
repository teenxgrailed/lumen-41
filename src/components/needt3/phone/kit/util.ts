/** Small helpers every phone-kit part shares (phone-kit.jsx top). */

export const pkCx = (...a: (string | false | null | undefined)[]) =>
  a.filter(Boolean).join(" ");

export const pkClamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

/** True when the person asked the system for less motion. */
export const pkReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type PkSide = "light" | "dark";

/** The opposite theme class: what an inverse plate wears. */
export const pkInverse = (side: PkSide) => (side === "dark" ? "paper" : "dark");

/**
 * The class a plate wears: light theme — inverse (a black plate); dark theme
 * — "pk-muted", a slightly raised dark surface with light text, never a big
 * white card. Only the primary button inside keeps full contrast.
 */
export const pkPlateClass = (side: PkSide) =>
  side === "dark" ? "pk-muted" : pkInverse(side);

export type SkyMood = "periwinkle" | "rose" | "dusk" | "night" | null;

/**
 * The sky's mood by time of day, like the desktop's Time theme: light —
 * pale periwinkle in the morning, the day's own mood by day, warm rose at
 * golden hour; dark — dusk in the evening, night otherwise. Skies follow the
 * APP theme, never the inverse plate they sit on. `hour` is the person's
 * local hour (0–23).
 */
export function pkSkyMood(side: PkSide, hour: number): SkyMood {
  if (side === "dark") return hour >= 17 && hour < 22 ? "dusk" : "night";
  return hour >= 5 && hour < 10
    ? "periwinkle"
    : hour >= 16 && hour < 21
      ? "rose"
      : null;
}

/**
 * Mark the phone host while something big moves in it (a sheet, the pull-down),
 * so the screen's own blur bands rest and only the mover's one blur is live
 * (rule 12: one backdrop-filter while it moves). The host is the nearest
 * `[data-v2p-host]`, else the layer's parent.
 */
export function pkMarkMoving(from: Element | null, on: boolean) {
  if (!from) return;
  const host = from.closest("[data-v2p-host]") ?? from.parentElement;
  host?.toggleAttribute("data-pk-moving", on);
}
