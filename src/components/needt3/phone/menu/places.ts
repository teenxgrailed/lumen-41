/**
 * Menu A's places (prototype nav-a.jsx NVA_ORDER / NVA_WORD, mobile-nav.jsx
 * mnTiles). Routes come from the desktop shell's `PLACES` registry (the route
 * map, docs/port/02-task-plan.md §2.4), so the phone and the rail can never
 * disagree about where a place lives. Pure.
 */
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
  | "templates"
  | "shared"
  | "trash"
  | "connections"
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
  "templates",
  "shared",
  "trash",
  "connections",
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
  templates: "templates",
  shared: "shared",
  trash: "trash",
};

/** The route of Connections (route map §2.4: a new place, not in `PLACES`). */
export const CONNECTIONS_HREF = "/connections";

/** The one big word of a row. */
export function menuWord(id: MenuPlaceId): string {
  switch (id) {
    case "ask":
      return "Ask Needt";
    case "connections":
      return "Connections";
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

/** The rows of the card: every place that is not one of the three. */
export function menuRows(top: readonly MenuPlaceId[]): MenuPlaceId[] {
  return MENU_ORDER.filter((id) => !top.includes(id));
}

/** The shell registry's glyph id for a place that has a drawn mark, else null. */
export function menuGlyphId(id: MenuPlaceId): string | null {
  const sid = SHELL_ID[id];
  return sid && sid !== "templates" && sid !== "shared" && sid !== "trash"
    ? sid
    : null;
}
