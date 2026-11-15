/**
 * Menu A's places (prototype nav-a.jsx NVA_ORDER / NVA_WORD, mobile-nav.jsx
 * mnTiles). Routes come from the desktop shell's `PLACES` registry (the route
 * map, docs/port/02-task-plan.md §2.4), so the phone and the rail can never
 * disagree about where a place lives. Pure.
 */
import { BUDGET_HREF } from "@/lib/needt3/budget";

import {
  PLACES,
  type PlaceId,
  TILE_SHORT,
  placeById,
  placeForPath,
} from "../../shell/places";

export type MenuPlaceId =
  | "home"
  | "calendar"
  | "tasks"
  | "docs"
  | "mail"
  | "ask"
  | "habits"
  | "moodboards"
  | "projects"
  | "goals"
  | "templates"
  | "shared"
  | "trash"
  | "connections"
  | "agents"
  | "budget"
  | "settings";

/**
 * Every place on the phone, plus Ask Needt (it opens the Ask sheet, not a
 * place) and Settings (it opens the Settings sheet).
 */
export const MENU_ORDER: readonly MenuPlaceId[] = [
  "home",
  "calendar",
  "tasks",
  "docs",
  "mail",
  "ask",
  "habits",
  "moodboards",
  "projects",
  "goals",
  "templates",
  "shared",
  "trash",
  "connections",
  "agents",
  "budget",
  "settings",
];

/** The phone's id -> the shell registry's id. */
const SHELL_ID: Partial<Record<MenuPlaceId, PlaceId>> = {
  home: "today",
  calendar: "calendar",
  tasks: "tasks",
  docs: "docs",
  mail: "mail",
  habits: "habits",
  moodboards: "moodboards",
  projects: "projects",
  goals: "goals",
  templates: "templates",
  shared: "shared",
  trash: "trash",
};

/** The route of Connections (route map §2.4: a new place, not in `PLACES`). */
export const CONNECTIONS_HREF = "/connections";

/**
 * The route of Agents. Like Connections it is not in `PLACES`, and it is a row
 * only while the agent hub is on for the person (`menuRows`).
 */
export const AGENTS_HREF = "/agents";

/** The one big word of a row. */
export function menuWord(id: MenuPlaceId): string {
  switch (id) {
    case "ask":
      return "Ask Needt";
    case "connections":
      return "Connections";
    case "agents":
      return "Agents";
    case "budget":
      return "Budget";
    case "settings":
      return "Settings";
    default: {
      const sid = SHELL_ID[id] as PlaceId;
      return TILE_SHORT[sid] ?? placeById(sid)?.label ?? id;
    }
  }
}

/** The grey line of a row while nothing has loaded yet (the shell's own sub). */
export function menuSub(id: MenuPlaceId): string {
  switch (id) {
    case "ask":
      return "Plans with your calendar and tasks";
    case "connections":
      return "Calendars, mail and tools";
    case "agents":
      return "Work you hand to agents";
    case "budget":
      return "Wallets and spending";
    case "settings":
      return "Theme, hours, notifications";
    default:
      return placeById(SHELL_ID[id] as PlaceId)?.sub ?? "";
  }
}

export type MenuAction =
  | { kind: "route"; href: string }
  | { kind: "ask" }
  | { kind: "settings" };

/** What choosing a place does. */
export function menuAction(id: MenuPlaceId): MenuAction {
  if (id === "ask") return { kind: "ask" };
  if (id === "settings") return { kind: "settings" };
  if (id === "connections") return { kind: "route", href: CONNECTIONS_HREF };
  if (id === "agents") return { kind: "route", href: AGENTS_HREF };
  if (id === "budget") return { kind: "route", href: BUDGET_HREF };
  const sid = SHELL_ID[id] as PlaceId;
  const place = PLACES.find((p) => p.id === sid);
  return { kind: "route", href: place ? place.href : "/today" };
}

/** The place a pathname belongs to ("you are here"), or null. */
export function menuIdForPath(pathname: string): MenuPlaceId | null {
  if (
    pathname === CONNECTIONS_HREF ||
    pathname.startsWith(`${CONNECTIONS_HREF}/`)
  )
    return "connections";
  if (pathname === AGENTS_HREF || pathname.startsWith(`${AGENTS_HREF}/`))
    return "agents";
  if (pathname === BUDGET_HREF || pathname.startsWith(`${BUDGET_HREF}/`))
    return "budget";
  const sid = placeForPath(pathname);
  if (!sid) return null;
  for (const id of MENU_ORDER) if (SHELL_ID[id] === sid) return id;
  return null;
}

/** Home, Docs and Ask Needt: the phone's own default, not the rail's. */
export const DEFAULT_TILES: readonly MenuPlaceId[] = ["home", "docs", "ask"];

/**
 * The ids a saved list may use (`UserSettings.prefs.mobileTiles`, written by
 * the phone setup and Settings -> Menu), including the desktop's spellings.
 * Settings is a place on the phone but never one of the three.
 */
const FROM_SAVED: Record<string, MenuPlaceId> = {
  today: "home",
  home: "home",
  calendar: "calendar",
  tasks: "tasks",
  docs: "docs",
  mail: "mail",
  habits: "habits",
  moodboards: "moodboards",
  boards: "moodboards",
  projects: "projects",
  goals: "goals",
  templates: "templates",
  shared: "shared",
  trash: "trash",
  connections: "connections",
  ask: "ask",
};

/** The pill's three places: the saved list when it names three, else the default. */
export function menuTilesFrom(prefs: unknown): MenuPlaceId[] {
  const raw =
    prefs && typeof prefs === "object"
      ? (prefs as Record<string, unknown>).mobileTiles
      : null;
  const out: MenuPlaceId[] = [];
  if (Array.isArray(raw))
    for (const v of raw) {
      const id = typeof v === "string" ? FROM_SAVED[v] : undefined;
      if (id && !out.includes(id)) out.push(id);
    }
  return out.length >= 3 ? out.slice(0, 3) : DEFAULT_TILES.slice();
}

/**
 * The rows of the card: every place that is not one of the three. Agents is a
 * row only while the agent hub is on for the person (`agents: true`), Budget
 * only while its place is shown (`budget: true`); without them the card is
 * exactly what it was.
 */
export function menuRows(
  top: readonly MenuPlaceId[],
  options: { agents?: boolean; budget?: boolean } = {}
): MenuPlaceId[] {
  return MENU_ORDER.filter(
    (id) =>
      !top.includes(id) &&
      (id !== "agents" || options.agents === true) &&
      (id !== "budget" || options.budget === true)
  );
}

/** The shell registry's glyph id for a place that has a drawn mark, else null. */
export function menuGlyphId(id: MenuPlaceId): string | null {
  const sid = SHELL_ID[id];
  return sid && sid !== "templates" && sid !== "shared" && sid !== "trash"
    ? sid
    : null;
}

/**
 * The bottom bar's two looks (`UserSettings.prefs.barStyle`): "classic" is
 * menu A's dark pill with the round + beside it; "float" is a light frosted
 * pill (dark frosted in the dark theme) holding the places, + and the menu
 * card's opener in one row. Anything else, or nothing saved, is "classic".
 */
export type BarStyle = "classic" | "float";
export const BAR_STYLES: readonly BarStyle[] = ["classic", "float"];

export function barStyleFrom(prefs: unknown): BarStyle {
  const raw =
    prefs && typeof prefs === "object"
      ? (prefs as Record<string, unknown>).barStyle
      : null;
  return raw === "float" ? "float" : "classic";
}

/**
 * The order places are offered to the bar after the saved list runs out.
 * Settings never sits in the bar (it opens a sheet, and the menu card has
 * it); Agents and Budget neither, since they are rows only while switched on.
 */
const BAR_NEVER: readonly MenuPlaceId[] = ["settings", "agents", "budget"];
const BAR_FALLBACK: readonly MenuPlaceId[] = [
  ...DEFAULT_TILES,
  ...MENU_ORDER.filter(
    (id) => !DEFAULT_TILES.includes(id) && !BAR_NEVER.includes(id)
  ),
];

/**
 * The bar's `count` places: the saved list (`prefs.mobileTiles`) first, in
 * its order, then the defaults, no repeats. This is the one place the bar's
 * ordering is decided, so a later ranking source swaps in here. Pure.
 */
export function barPlaces(prefs: unknown, count: number): MenuPlaceId[] {
  const raw =
    prefs && typeof prefs === "object"
      ? (prefs as Record<string, unknown>).mobileTiles
      : null;
  const out: MenuPlaceId[] = [];
  const n = Math.max(0, Math.floor(count));
  const add = (id: MenuPlaceId | undefined) => {
    if (id && out.length < n && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(raw))
    for (const v of raw) add(typeof v === "string" ? FROM_SAVED[v] : undefined);
  for (const id of BAR_FALLBACK) add(id);
  return out;
}

/**
 * How many places the floating bar holds: three, beside "+" and the menu
 * opener (five slots). The same three as the classic pill, so the card that
 * opens from either bar shows the same tiles on top.
 */
export const BAR_PLACE_SLOTS = 3;
