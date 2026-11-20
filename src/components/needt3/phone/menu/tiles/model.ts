/**
 * The phone menu's tiles: what each one says, where it goes, and the drag
 * arithmetic of the editor. Pure: nothing here reads a clock, the DOM or a
 * store (the facts come in as numbers and strings).
 */
import {
  type MenuTile,
  type MenuTileId,
  moveTile,
  tileKey,
} from "@/lib/phone-menu/layout";

import { type MenuPlaceId, menuSub } from "../places";
import { type MenuCounts, menuStatus } from "../status";

/** What the live tiles need beyond the shared counts. */
export interface TileFacts {
  counts: MenuCounts;
  /** A focus session runs: its ring and clock. Null when none does. */
  focus: {
    /** The minutes (or clock) in the middle of the ring. */
    label: string;
    /** 0..1 of the planned length that has run; 0 for a count-up. */
    pct: number;
    paused: boolean;
  } | null;
  /** Closed days in a row, or undefined until the tasks have loaded. */
  streak?: number;
  /** The own colour of the first habit, when it has one. */
  habitHue?: string | null;
  /** Active projects by id. */
  projects: ReadonlyMap<string, { name: string; hue: string | null; open: number }>;
}

/** What a tile draws, and what a tap on it does. */
export interface TileView {
  /** The small kind line, top left. */
  label: string;
  /** The one big word. */
  word: string;
  /** The grey line under it. */
  sub: string;
  /** The tile's own colour (a CSS colour) when the object has one; else the id's hue in CSS. */
  hue: string | null;
  alert: boolean;
  /** What the tap does. */
  go:
    | { kind: "place"; id: MenuPlaceId }
    | { kind: "focus" }
    | { kind: "project"; id: string };
  /** A tile that carries no live number yet (the data has not loaded). */
  quiet: boolean;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A tile of the catalogue, said from the facts. */
export function tileView(tile: MenuTile, f: TileFacts): TileView {
  const c = f.counts;
  switch (tile.id) {
    case "today": {
      const s = menuStatus("home", c);
      return {
        label: "Plan",
        word: "Today",
        sub: s.text,
        hue: null,
        alert: !!s.alert,
        go: { kind: "place", id: "home" },
        quiet: c.today === undefined,
      };
    }
    case "focus":
      return {
        label: "Focus",
        word: f.focus ? f.focus.label : "Focus",
        sub: f.focus
          ? f.focus.paused
            ? "Paused"
            : "Time left"
          : "Start a session",
        hue: null,
        alert: false,
        go: { kind: "focus" },
        quiet: !f.focus,
      };
    case "calendar": {
      const n = c.nextEvent;
      return {
        label: "Calendar",
        word: n ? n.at : n === null ? "Free" : "Calendar",
        sub: n ? n.title : n === null ? "Nothing else today" : menuSub("calendar"),
        hue: null,
        alert: false,
        go: { kind: "place", id: "calendar" },
        quiet: n === undefined,
      };
    }
    case "habits":
      return {
        label: "Habits",
        word:
          c.habits === undefined
            ? "Habits"
            : c.habits
              ? `${c.habitsDone ?? 0} of ${c.habits}`
              : "None yet",
        sub: c.habits ? "kept today" : menuSub("habits"),
        hue: f.habitHue ?? null,
        alert: false,
        go: { kind: "place", id: "habits" },
        quiet: c.habits === undefined,
      };
    case "inbox":
      return {
        label: "Inbox",
        word:
          c.unplaced === undefined
            ? "Inbox"
            : c.unplaced
              ? String(c.unplaced)
              : "Clear",
        sub:
          c.unplaced === undefined
            ? "Tasks without a time"
            : c.unplaced
              ? "not placed"
              : "Everything has a time",
        hue: null,
        alert: false,
        go: { kind: "place", id: "tasks" },
        quiet: c.unplaced === undefined,
      };
    case "mail": {
      const s = menuStatus("mail", c);
      return {
        label: "Mail",
        word: c.mail ? String(c.mail) : c.mail === 0 ? "All read" : "Mail",
        sub: c.mail ? "unread" : s.text,
        hue: null,
        alert: !!s.alert,
        go: { kind: "place", id: "mail" },
        quiet: c.mail === undefined,
      };
    }
    case "docs":
      return {
        label: "Docs",
        word: c.docs === undefined ? "Docs" : plural(c.docs, "page", "pages"),
        sub: c.docs ? `edited ${c.docsEdited || "today"}` : menuSub("docs"),
        hue: null,
        alert: false,
        go: { kind: "place", id: "docs" },
        quiet: c.docs === undefined,
      };
    case "ask":
      return {
        label: "Assistant",
        word: "Ask Needt",
        sub: menuSub("ask"),
        hue: null,
        alert: false,
        go: { kind: "place", id: "ask" },
        quiet: false,
      };
    case "streak":
      return {
        label: "Streak",
        word:
          f.streak === undefined ? "Streak" : plural(f.streak, "day", "days"),
        sub: f.streak === undefined ? "Days closed in a row" : "closed in a row",
        hue: null,
        alert: false,
        go: { kind: "place", id: "home" },
        quiet: f.streak === undefined,
      };
    case "project": {
      const p = tile.projectId ? f.projects.get(tile.projectId) : undefined;
      return {
        label: "Project",
        word: p ? p.name : "Project",
        sub: p ? `${p.open} open` : "Not found",
        hue: p?.hue ?? null,
        alert: false,
        go: { kind: "project", id: tile.projectId ?? "" },
        quiet: !p,
      };
    }
  }
}

/** The places a tile stands for, so the "All places" list leaves them out. */
export function placesOnGrid(tiles: readonly MenuTile[]): Set<MenuPlaceId> {
  const out = new Set<MenuPlaceId>();
  for (const t of tiles) {
    const g = TILE_PLACE[t.id];
    if (g) out.add(g);
  }
  return out;
}

const TILE_PLACE: Partial<Record<MenuTileId, MenuPlaceId>> = {
  today: "home",
  calendar: "calendar",
  habits: "habits",
  inbox: "tasks",
  mail: "mail",
  docs: "docs",
  ask: "ask",
};

/** The word of a catalogue entry in the Add list. */
export function tileName(id: MenuTileId): string {
  switch (id) {
    case "today":
      return "Today";
    case "focus":
      return "Focus";
    case "habits":
      return "Habits";
    case "inbox":
      return "Inbox";
    case "calendar":
      return "Calendar";
    case "mail":
      return "Mail";
    case "docs":
      return "Docs";
    case "ask":
      return "Ask Needt";
    case "streak":
      return "Streak";
    case "project":
      return "Project folder";
  }
}

/* ---------- the editor ---------- */

/** A tile's box in the grid, in px of the viewport, measured when a drag starts. */
export interface TileBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a dragged tile lands: the index of the tile whose box holds the
 * finger, or, over a gap, the nearest box by its centre. -1 for an empty grid.
 */
export function dropIndex(
  boxes: readonly TileBox[],
  x: number,
  y: number
): number {
  if (!boxes.length) return -1;
  let best = 0;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      best = i;
      bestD = -1;
    } else if (bestD >= 0) {
      const dx = b.x + b.w / 2 - x;
      const dy = b.y + b.h / 2 - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/** The list after dragging the tile with `key` onto index `to`. */
export function dragTo(
  tiles: readonly MenuTile[],
  key: string,
  to: number
): MenuTile[] {
  const from = tiles.findIndex((t) => tileKey(t) === key);
  return from < 0 ? [...tiles] : moveTile(tiles, from, to);
}

/** The tile flipped between its two sizes. */
export function resized(tiles: readonly MenuTile[], key: string): MenuTile[] {
  return tiles.map((t) =>
    tileKey(t) === key
      ? { ...t, size: t.size === "1x1" ? "2x1" : "1x1" }
      : { ...t }
  );
}

/** The list without the tile with `key`. */
export function removed(tiles: readonly MenuTile[], key: string): MenuTile[] {
  return tiles.filter((t) => tileKey(t) !== key);
}
