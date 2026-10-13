/**
 * The sidebar's places and the person's layout of them (prototype
 * sidebar-kit.jsx SK_PLACES / skMerge, Sidebar.jsx sbTiles*). Pure: the
 * sidebar, Customize Sidebar and the context menu all go through here.
 *
 * Stored in `UserSettings.prefs.sidebar`. Onboarding writes
 * `prefs.sidebarTiles` (every place id in order); while no `sidebar` layout
 * has been saved, that list decides the tiles.
 */
import type { ArtName } from "../menu/Art";

export type PlaceId =
  | "today"
  | "calendar"
  | "tasks"
  | "docs"
  | "mail"
  | "projects"
  | "moodboards"
  | "habits"
  | "templates"
  | "shared"
  | "trash";

export interface ShellPlace {
  id: PlaceId;
  label: string;
  art: ArtName;
  sub: string;
  /** Route in the v3 frame (route map §2.4). */
  href: string;
}

export const PLACES: readonly ShellPlace[] = [
  {
    id: "today",
    label: "Home",
    art: "home",
    sub: "Your day as a page",
    href: "/today",
  },
  {
    id: "calendar",
    label: "Calendar",
    art: "event",
    sub: "Events and placed work",
    href: "/calendar",
  },
  {
    id: "tasks",
    label: "Tasks",
    art: "task",
    sub: "Inbox, today, upcoming",
    href: "/tasks",
  },
  {
    id: "docs",
    label: "Docs",
    art: "page",
    sub: "Pages and notes",
    href: "/pages",
  },
  {
    id: "mail",
    label: "Mailbox",
    art: "mail",
    sub: "What is waiting on you",
    href: "/mail",
  },
  {
    id: "projects",
    label: "Projects",
    art: "work",
    sub: "Every task, by project",
    href: "/projects",
  },
  {
    id: "moodboards",
    label: "Moodboards",
    art: "stack",
    sub: "References, side by side",
    href: "/moodboards",
  },
  {
    id: "habits",
    label: "Habits",
    art: "habit",
    sub: "What comes back every day",
    href: "/habits",
  },
  {
    id: "templates",
    label: "Templates",
    art: "template",
    sub: "Pages you start from",
    href: "/templates",
  },
  {
    id: "shared",
    label: "Shared",
    art: "stack",
    sub: "Pages others shared with you",
    href: "/shared",
  },
  {
    id: "trash",
    label: "Trash",
    art: "trash",
    sub: "Kept for 30 days",
    href: "/trash",
  },
];

export type SectionId = "starred" | "projects";

export const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: "starred", label: "Pinned" },
  { id: "projects", label: "Projects" },
];

/** A tile label must fit a third of the rail; the full name stays elsewhere. */
export const TILE_SHORT: Partial<Record<PlaceId, string>> = {
  moodboards: "Boards",
};

/** Five tiles; More is always the sixth. */
export const TILES_MAX = 5;

export interface SidebarPrefs {
  places: { id: PlaceId; on: boolean }[];
  sections: { id: SectionId; on: boolean }[];
  /** Section ids folded shut. */
  collapsed: Partial<Record<SectionId, boolean>>;
}

export const DEFAULT_PREFS: SidebarPrefs = {
  places: PLACES.map((p, i) => ({ id: p.id, on: i < TILES_MAX })),
  sections: SECTIONS.map((s) => ({ id: s.id, on: true })),
  collapsed: {},
};

const PLACE_IDS = new Set<string>(PLACES.map((p) => p.id));
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

export function placeById(id: string): ShellPlace | undefined {
  return PLACES.find((p) => p.id === id);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Keep known ids once, in order, with a boolean `on`. */
function cleanList<T extends string>(
  v: unknown,
  known: Set<string>
): { id: T; on: boolean }[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: { id: T; on: boolean }[] = [];
  for (const row of v) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    if (!known.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id as T, on: row.on === true });
  }
  return out;
}

/**
 * Saved prefs keep their order and choices; places that did not exist when
 * they were saved are appended (off), unknown places drop out.
 */
export function mergePrefs(saved: unknown): SidebarPrefs {
  if (!isRecord(saved)) return DEFAULT_PREFS;
  const places = cleanList<PlaceId>(saved.places, PLACE_IDS);
  for (const p of PLACES)
    if (!places.some((x) => x.id === p.id))
      places.push({ id: p.id, on: false });
  const sections = cleanList<SectionId>(saved.sections, SECTION_IDS);
  for (const s of SECTIONS)
    if (!sections.some((x) => x.id === s.id))
      sections.push({ id: s.id, on: true });
  const collapsed: SidebarPrefs["collapsed"] = {};
  if (isRecord(saved.collapsed))
    for (const id of SECTION_IDS)
      if (saved.collapsed[id] === true) collapsed[id as SectionId] = true;
  return {
    places: Array.isArray(saved.places) ? places : DEFAULT_PREFS.places,
    sections,
    collapsed,
  };
}

/**
 * Onboarding's list as a layout: the first five on, the rest off, in order;
 * places the list leaves out follow, off. `null` when the list is unusable.
 */
export function prefsFromTiles(want: unknown): SidebarPrefs | null {
  if (!Array.isArray(want)) return null;
  const ids = want.filter(
    (id, i): id is PlaceId =>
      typeof id === "string" && PLACE_IDS.has(id) && want.indexOf(id) === i
  );
  if (!ids.length) return null;
  return {
    ...DEFAULT_PREFS,
    places: ids
      .map((id, i) => ({ id, on: i < TILES_MAX }))
      .concat(
        PLACES.filter((p) => !ids.includes(p.id)).map((p) => ({
          id: p.id,
          on: false,
        }))
      ),
  };
}

/** The layout to draw: a saved one, else onboarding's tiles, else default. */
export function prefsFromSettings(
  prefs: Record<string, unknown> | undefined
): SidebarPrefs {
  if (prefs && isRecord(prefs.sidebar)) return mergePrefs(prefs.sidebar);
  return prefsFromTiles(prefs?.sidebarTiles) ?? DEFAULT_PREFS;
}

export function splitPlaces(prefs: SidebarPrefs) {
  const tiles: ShellPlace[] = [];
  const rest: ShellPlace[] = [];
  for (const row of prefs.places) {
    const p = placeById(row.id);
    if (p) (row.on ? tiles : rest).push(p);
  }
  return { tiles, rest };
}

/** Tiles fill rows of three; a full last row puts More on a short wide row. */
export function moreIsWide(tileCount: number) {
  return tileCount > 0 && tileCount % 3 === 0;
}

/** More opens rightward unless it sits in the last column. */
export function moreAlign(tileCount: number): "left" | "right" {
  return tileCount % 3 === 2 ? "right" : "left";
}

export function setPlaceOn(
  prefs: SidebarPrefs,
  id: PlaceId,
  on: boolean
): SidebarPrefs {
  return {
    ...prefs,
    places: prefs.places.map((p) => (p.id === id ? { ...p, on } : p)),
  };
}

export function toggleRow(
  prefs: SidebarPrefs,
  key: "places" | "sections",
  id: string
): SidebarPrefs {
  if (key === "places")
    return {
      ...prefs,
      places: prefs.places.map((p) => (p.id === id ? { ...p, on: !p.on } : p)),
    };
  return {
    ...prefs,
    sections: prefs.sections.map((s) =>
      s.id === id ? { ...s, on: !s.on } : s
    ),
  };
}

/** Move row `from` to where row `to` is (drag to reorder). */
export function moveRow(
  prefs: SidebarPrefs,
  key: "places" | "sections",
  from: string,
  to: string
): SidebarPrefs {
  const reorder = <T extends { id: string }>(list: T[]) => {
    const a = list.findIndex((x) => x.id === from);
    const b = list.findIndex((x) => x.id === to);
    if (a < 0 || b < 0 || a === b) return list;
    const next = list.slice();
    const [it] = next.splice(a, 1);
    next.splice(b, 0, it);
    return next;
  };
  return key === "places"
    ? { ...prefs, places: reorder(prefs.places) }
    : { ...prefs, sections: reorder(prefs.sections) };
}

export function foldSection(prefs: SidebarPrefs, id: SectionId): SidebarPrefs {
  const collapsed = { ...prefs.collapsed };
  if (collapsed[id]) delete collapsed[id];
  else collapsed[id] = true;
  return { ...prefs, collapsed };
}

/** The place a pathname belongs to (a doc belongs to Docs). */
export function placeForPath(pathname: string): PlaceId | null {
  for (const p of PLACES)
    if (pathname === p.href || pathname.startsWith(`${p.href}/`)) return p.id;
  return null;
}
