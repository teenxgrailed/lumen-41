/**
 * HOME BLOCKS - which blocks Home shows, and in what order the rail's tiles
 * sit. A person-level choice stored in the user settings under
 * `prefs.homeBlocks`, read and written through `GET/PATCH /api/user-settings`
 * (docs/connector-api.md), so it follows the person across devices and is
 * reachable from outside.
 *
 * Pure: a stored value in, a complete setting out.
 */

/** The key in `prefs`. */
export const HOME_BLOCKS_PREF = "homeBlocks";

/** The right rail's tiles on desktop Home, in their default order. */
export const RAIL_TILES = [
  "todayBar",
  "habits",
  "week",
  "schedule",
  "inbox",
] as const;
export type RailTile = (typeof RAIL_TILES)[number];

/** Every block that can be switched off. */
export const HOME_BLOCK_IDS = [
  "nextUp",
  "todayBar",
  "habits",
  "week",
  "schedule",
  "inbox",
  "weather",
] as const;
export type HomeBlockId = (typeof HOME_BLOCK_IDS)[number];

export interface HomeBlocks {
  /** true = shown. */
  nextUp: boolean;
  todayBar: boolean;
  habits: boolean;
  week: boolean;
  schedule: boolean;
  inbox: boolean;
  weather: boolean;
  /** The rail's tiles, top to bottom (always all five, each once). */
  order: RailTile[];
}

export const DEFAULT_HOME_BLOCKS: HomeBlocks = {
  nextUp: true,
  todayBar: true,
  habits: true,
  week: true,
  schedule: true,
  inbox: true,
  weather: true,
  order: [...RAIL_TILES],
};

/** The menu's labels (short: the form-row label column is 105 px). */
export const HOME_BLOCK_LABEL: Record<HomeBlockId, string> = {
  nextUp: "Next up",
  todayBar: "Today bar",
  habits: "Habits",
  week: "This week",
  schedule: "Schedule",
  inbox: "Inbox",
  weather: "Weather",
};

const isTile = (v: unknown): v is RailTile =>
  RAIL_TILES.includes(v as RailTile);

/** A stored order, repaired: unknown and repeated ids dropped, missing ones appended. */
function readOrder(v: unknown): RailTile[] {
  const seen: RailTile[] = [];
  if (Array.isArray(v))
    for (const x of v) if (isTile(x) && !seen.includes(x)) seen.push(x);
  for (const t of RAIL_TILES) if (!seen.includes(t)) seen.push(t);
  return seen;
}

/** A stored value to settings; anything unknown or malformed takes its default. */
export function readHomeBlocks(stored: unknown): HomeBlocks {
  const o =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const flag = (k: HomeBlockId) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : true;
  return {
    nextUp: flag("nextUp"),
    todayBar: flag("todayBar"),
    habits: flag("habits"),
    week: flag("week"),
    schedule: flag("schedule"),
    inbox: flag("inbox"),
    weather: flag("weather"),
    order: readOrder(o.order),
  };
}

/** The setting out of a `prefs` map. */
export const homeBlocksOf = (prefs: Record<string, unknown> | undefined) =>
  readHomeBlocks(prefs?.[HOME_BLOCKS_PREF]);

/**
 * Strict check for the API: undefined when `stored` is valid (known keys,
 * booleans, `order` a list of known tile ids), else a message.
 */
export function homeBlocksError(stored: unknown): string | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return "homeBlocks must be an object";
  const o = stored as Record<string, unknown>;
  for (const k of HOME_BLOCK_IDS)
    if (k in o && typeof o[k] !== "boolean")
      return `homeBlocks.${k} must be a boolean`;
  if ("order" in o) {
    if (!Array.isArray(o.order) || !o.order.every(isTile))
      return `homeBlocks.order must be a list of ${RAIL_TILES.join(", ")}`;
    if (new Set(o.order).size !== o.order.length)
      return "homeBlocks.order must not repeat a tile";
  }
  const known = new Set<string>([...HOME_BLOCK_IDS, "order"]);
  const extra = Object.keys(o).find((k) => !known.has(k));
  return extra ? `homeBlocks.${extra} is not an option` : undefined;
}

/** The rail's tiles that are on, in the person's order. */
export const shownRailTiles = (b: HomeBlocks): RailTile[] =>
  b.order.filter((t) => b[t]);

/** Move one tile a step up (-1) or down (+1) in the order. */
export function moveRailTile(
  order: RailTile[],
  tile: RailTile,
  by: -1 | 1
): RailTile[] {
  const i = order.indexOf(tile);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
