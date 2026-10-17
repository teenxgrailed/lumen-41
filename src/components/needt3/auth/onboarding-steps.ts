/**
 * Onboarding as a pure state machine (owner-approved flow, 2026-10-17). Three
 * short steps and an optional fourth, then Today with a sample day:
 *
 *   use       what Needt is for: Work / Study / Personal / Side project. Any
 *             mix, in the order picked: the FIRST pick drives the sample day
 *   calendar  Google, iCloud or Outlook; skippable; only providers the server
 *             has keys for are shown (iCloud needs none)
 *   hours     the per-day working hours of Settings, prefilled Mon-Fri 9-17,
 *             and the time zone
 *   import    Todoist / Notion, only when the server can run them
 *
 * The sidebar game below is no longer a step; its helpers stay because the
 * sidebar tiles are still arranged with them elsewhere.
 */
export const STEP_IDS = ["use", "calendar", "hours", "import"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEPS: ReadonlyArray<readonly [StepId, string, string]> = [
  [
    "use",
    "What you use it for",
    "Pick what fits. The first one you pick decides the sample day you start with.",
  ],
  [
    "calendar",
    "Your calendar",
    "Needt plans tasks around your events. You can connect one later from Settings.",
  ],
  [
    "hours",
    "Your working hours",
    "Needt only places work inside these hours. Change them any day in Settings.",
  ],
  [
    "import",
    "Bring your work",
    "Already keep tasks or notes somewhere else? Import them now, or any time from Settings.",
  ],
];

/** Which sky layout each step stands on. */
export const STEP_SKY: Record<StepId, "a" | "b" | "c" | "d"> = {
  use: "a",
  calendar: "c",
  hours: "b",
  import: "d",
};

/** The steps shown: Import only when the server can run an importer. */
export function stepsFor(showImport: boolean): StepId[] {
  return STEP_IDS.filter((id) => id !== "import" || showImport);
}

export const stepIndex = (id: string, ids: readonly string[] = STEP_IDS) =>
  ids.indexOf(id);

export function clampStep(n: number, count: number = STEP_IDS.length): number {
  return Math.max(0, Math.min(count - 1, Math.round(n) || 0));
}

/** The first working hour is 05:00, the last 23:00 (the schema stores whole hours). */
export const HOUR_CHOICES: readonly number[] = Array.from(
  { length: 19 },
  (_, i) => i + 5
);

export const hhmm = (h: number): string => String(h).padStart(2, "0") + ":00";

/** The day has to end at least an hour after it starts. */
export function badHours(start: number, end: number): boolean {
  return end - start < 1;
}

export interface GoInput {
  from: number;
  to: number;
  /** How many steps are shown. */
  count: number;
}

/** Where a Back / Continue / dot press lands. */
export function goTo(i: GoInput): number {
  return clampStep(i.to, i.count);
}

/** Which of the four uses a person picked, in the order they picked them. */
export function toggleUse(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/* ── The sidebar game ─────────────────────────────────────────────────────── */

/** Tiles in the grid; More is always the sixth and cannot move. */
export const SB_TILES = 5;

/** a and b trade places. Same list when either is unknown or they are equal. */
export function swapTiles(
  order: readonly string[],
  a: string,
  b: string
): string[] {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  const out = order.slice();
  if (ia < 0 || ib < 0 || ia === ib) return out;
  out[ia] = b;
  out[ib] = a;
  return out;
}

export interface SwapEffect {
  /** Both places that were touched land with a small settle. */
  land: [string, string];
  /** The place that moved from the grid out to More, if any. */
  back: string | null;
  /** The place that moved from More into the grid, if any. */
  into: string | null;
}

export function swapEffect(
  order: readonly string[],
  a: string,
  b: string
): SwapEffect {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  const into = ia >= SB_TILES ? a : ib >= SB_TILES ? b : null;
  const back = into === a ? b : into === b ? a : null;
  return { land: [a, b], back: into ? back : null, into };
}

/** A place from the sea can only land on a tile, never on another place. */
export function canDrop(
  order: readonly string[],
  dragged: string,
  target: string
): boolean {
  if (dragged === target) return false;
  const dFrom = order.indexOf(dragged);
  const tIx = order.indexOf(target);
  if (dFrom < 0 || tIx < 0) return false;
  return !(dFrom >= SB_TILES && tIx >= SB_TILES);
}

/** The saved tile list repaired against the places that exist today. */
export function startOrder(all: readonly string[], saved: unknown): string[] {
  if (!Array.isArray(saved)) return all.slice();
  const out = saved.filter(
    (id, n): id is string =>
      typeof id === "string" && all.includes(id) && saved.indexOf(id) === n
  );
  for (const id of all) if (!out.includes(id)) out.push(id);
  return out;
}

/** The sentence read out after a swap. */
export function swapSay(
  name: (id: string) => string,
  order: readonly string[],
  a: string,
  b: string
): string {
  const e = swapEffect(order, a, b);
  return e.into && e.back
    ? `${name(e.into)} is a tile now; ${name(e.back)} moved to More.`
    : `${name(a)} and ${name(b)} swapped places.`;
}

/* ── What leaving a step writes ───────────────────────────────────────────── */

/** The scheduler's own default when a person has no row yet (9–17). */
export const DEFAULT_HOURS = { start: 9, end: 17 } as const;

/** Zones that mean "never chosen": the schema default and its alias. */
const UNSET_ZONES = new Set(["UTC", "Etc/UTC"]);

/**
 * The zone to preselect: a person who has not finished setup and still sits
 * on the server default gets this device's zone; anyone else keeps theirs.
 */
export function startZone(
  saved: string,
  device: string,
  onboarded: boolean
): string {
  if (!onboarded && UNSET_ZONES.has(saved) && device) return device;
  return saved || device;
}

/** Zone choices: the device's and the saved one always present, no repeats. */
export function zoneChoices(
  base: readonly string[],
  device: string,
  saved: string | undefined
): string[] {
  const out: string[] = [];
  for (const z of [device, saved, ...base])
    if (z && !out.includes(z)) out.push(z);
  return out;
}
