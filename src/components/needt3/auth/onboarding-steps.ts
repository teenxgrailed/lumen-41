/**
 * Onboarding as a pure state machine (prototype AuthScreen.jsx: STEPS,
 * OnboardingScreen, ObSidebarGame). Five steps, no view step: the start view
 * is chosen for the person (Calendar opens on Week).
 *
 *   use      what Needt is for: any mix of Work / Personal / Side business
 *   setup    connect a calendar (skippable) + working hours + time zone
 *   sidebar  "Make your sidebar": five tiles and More; swap places in
 *   first    the first task
 *   placed   where it went
 */
export const STEP_IDS = ["use", "setup", "sidebar", "first", "placed"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEPS: ReadonlyArray<readonly [StepId, string, string]> = [
  [
    "use",
    "What you use it for",
    "Pick all that fit — it only changes what Needt suggests first.",
  ],
  [
    "setup",
    "Calendar and hours",
    "Needt plans tasks around your events, inside the hours you work.",
  ],
  [
    "sidebar",
    "Your sidebar",
    "Six tiles sit at the top of the sidebar. Swap in the places you’ll open most — the rest wait under More.",
  ],
  [
    "first",
    "Your first task",
    "Type it the way you’d say it — Needt reads the day, length and project from the words.",
  ],
  [
    "placed",
    "Where it went",
    "Nothing is locked: drag it, or let Needt move it when your day changes.",
  ],
];

/** Which sky layout each step stands on. */
export const STEP_SKY: Record<StepId, "a" | "b" | "c" | "d"> = {
  use: "a",
  setup: "c",
  sidebar: "a",
  first: "b",
  placed: "d",
};

export const stepIndex = (id: string): number => STEP_IDS.indexOf(id as StepId);

export function clampStep(n: number): number {
  return Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(n) || 0));
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
  start: number;
  end: number;
  /** A first task exists (the "placed" step needs it). */
  hasFirst: boolean;
}

/** Where a Back / Continue / dot press lands, or null when it is refused. */
export function goTo(i: GoInput): number | null {
  const to = clampStep(i.to);
  if (to === stepIndex("placed") && !i.hasFirst) return null;
  if (to > i.from && STEP_IDS[i.from] === "setup" && badHours(i.start, i.end))
    return null;
  return to;
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

export interface HoursState {
  /** The saved row came back; until then the shown hours are only defaults. */
  loaded: boolean;
  start: number;
  end: number;
  savedStart: number;
  savedEnd: number;
}

/**
 * The working-hours PATCH body, or null when nothing should be sent: the
 * saved row never loaded (defaults would overwrite real hours), nothing
 * changed, or the hours are invalid.
 */
export function hoursPatch(
  h: HoursState
): { workHourStart: number; workHourEnd: number } | null {
  if (!h.loaded) return null;
  if (h.start === h.savedStart && h.end === h.savedEnd) return null;
  if (badHours(h.start, h.end)) return null;
  return { workHourStart: h.start, workHourEnd: h.end };
}

/**
 * Steps whose choices are written when moving forward from `from` to `to`:
 * only the ones the person actually stood on. Jumping ahead with the dots
 * does not save a step that was never shown.
 */
export function stepsToSave(
  from: number,
  to: number,
  visited: ReadonlySet<string>
): StepId[] {
  const out: StepId[] = [];
  for (let k = from; k < to; k++) {
    const id = STEP_IDS[k];
    if (id && visited.has(id)) out.push(id);
  }
  return out;
}

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
