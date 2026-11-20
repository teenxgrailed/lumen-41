/**
 * The phone menu's tiles: what each one says, where it goes, and the drag
 * arithmetic of the editor. Pure: nothing here reads a clock, the DOM or a
 * store (the facts come in as numbers and strings).
 */
import { addDays } from "@/lib/needt3/derive";
import type { V3Doc, V3Event, V3MailThread, V3Task } from "@/lib/needt3/map";
import {
  type MenuTile,
  type MenuTileId,
  moveTile,
  tileKey,
} from "@/lib/phone-menu/layout";

import { type MenuPlaceId, menuSub } from "../places";
import { type MenuCounts, menuStatus } from "../status";

/** One line of the Today tile: a task, with its clock time when it has one. */
export interface TodayRow {
  time: string | null;
  title: string;
}
/** A timed event of today, in minutes from midnight (the day strip). */
export interface DayEvent {
  title: string;
  at: string;
  start: number;
  end: number;
}
export interface HabitRow {
  id: string;
  title: string;
  color: string | null;
  done: boolean;
}
export interface MailRow {
  from: string;
  subject: string;
  preview: string;
  unread: boolean;
}
export type WeekDot = "closed" | "open" | "quiet";

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
  /** Active projects by id, with the titles of their first open tasks. */
  projects: ReadonlyMap<
    string,
    { name: string; hue: string | null; open: number; titles?: string[] }
  >;
  /** Open tasks of today, in the order of the day. */
  today?: TodayRow[];
  /** Timed events of today still ahead or running, soonest first. */
  events?: DayEvent[];
  /** Minutes from midnight, now (the day strip's marker). */
  nowMin?: number;
  habitRows?: HabitRow[];
  /** Titles of the tasks that have no time yet. */
  inboxTitles?: string[];
  mailRows?: MailRow[];
  /** The documents edited last, newest first, and how long ago each was. */
  docs?: V3Doc[];
  docsAgo?: ReadonlyMap<string, string>;
  /** The last seven days, oldest first, today last. */
  week?: WeekDot[];
}

/* ---------- reading the app's own data into what a tile shows ---------- */

const hm = (stamp: string) => stamp.slice(11, 16);
const toMin = (stamp: string) =>
  Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));

/** Open tasks of today: placed ones by their start, then the ones only due today. */
export function todayRows(
  tasks: readonly Pick<
    V3Task,
    "title" | "done" | "noSlot" | "dueDate" | "scheduledStart"
  >[],
  today: string,
  limit = 9
): TodayRow[] {
  const placed: { at: string; title: string }[] = [];
  const due: string[] = [];
  for (const t of tasks) {
    if (t.done || t.noSlot) continue;
    if (t.scheduledStart && t.scheduledStart.slice(0, 10) === today)
      placed.push({ at: t.scheduledStart, title: t.title });
    else if (t.dueDate === today) due.push(t.title);
  }
  placed.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return [
    ...placed.map((p) => ({ time: hm(p.at), title: p.title || "Untitled" })),
    ...due.map((title) => ({ time: null, title: title || "Untitled" })),
  ].slice(0, limit);
}

/** Timed events of today that have not ended, soonest first. */
export function dayEvents(
  events: readonly Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay">[],
  now: string,
  limit = 6
): DayEvent[] {
  const today = now.slice(0, 10);
  return events
    .filter(
      (e) => !e.isAllDay && e.startAt.slice(0, 10) === today && e.endAt > now
    )
    .sort((a, b) =>
      a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0
    )
    .slice(0, limit)
    .map((e) => ({
      title: e.title || "Event",
      at: hm(e.startAt),
      start: toMin(e.startAt),
      end: e.endAt.slice(0, 10) === today ? toMin(e.endAt) : 24 * 60,
    }));
}

/** Seven days ending today: closed (everything due was done), open, or nothing due. */
export function weekDots(
  tasks: readonly Pick<V3Task, "dueDate" | "done">[],
  today: string
): WeekDot[] {
  const byDay = new Map<string, boolean>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    byDay.set(t.dueDate, (byDay.get(t.dueDate) ?? true) && t.done);
  }
  const out: WeekDot[] = [];
  for (let i = 6; i >= 0; i--) {
    const v = byDay.get(addDays(today, -i));
    out.push(v === undefined ? "quiet" : v ? "closed" : "open");
  }
  return out;
}

/** Unread threads first, then the newest read ones; at most `limit`. */
export function mailRows(
  threads: readonly Pick<
    V3MailThread,
    | "from"
    | "subject"
    | "preview"
    | "isRead"
    | "isArchived"
    | "trashedAt"
    | "receivedAt"
  >[],
  limit = 3
): MailRow[] {
  const live = threads
    .filter((m) => !m.isArchived && !m.trashedAt)
    .sort((a, b) =>
      a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0
    );
  const unread = live.filter((m) => !m.isRead);
  const rest = live.filter((m) => m.isRead);
  return [...unread, ...rest].slice(0, limit).map((m) => ({
    from: m.from || "Unknown",
    subject: m.subject || "(no subject)",
    preview: m.preview || "",
    unread: !m.isRead,
  }));
}

/** What a tile draws, and what a tap on it does. */
export interface TileView {
  /** The one name a tile carries (a project folder carries the project's). */
  name: string;
  /** The kind, for the spoken label only: it is not drawn. */
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
  return { ...tileSay(tile, f), name: nameOf(tile, f) };
}

function nameOf(tile: MenuTile, f: TileFacts): string {
  if (tile.id === "project")
    return (
      (tile.projectId && f.projects.get(tile.projectId)?.name) ||
      tileName("project")
    );
  return tileName(tile.id);
}

function tileSay(tile: MenuTile, f: TileFacts): Omit<TileView, "name"> {
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
        sub: n
          ? n.title
          : n === null
            ? "Nothing else today"
            : menuSub("calendar"),
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
        sub:
          f.streak === undefined ? "Days closed in a row" : "closed in a row",
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

/* ---------- the grid, for the live reflow of a drag ---------- */

/** A tile's cell in the two-column grid: the column it starts in and its row. */
export interface Slot {
  col: 0 | 1;
  row: number;
  span: 1 | 2;
}

/**
 * Where each tile sits when the tiles are laid out in order, the way the CSS
 * grid places them (no back-filling: a wide tile that does not fit beside a
 * half tile starts the next row). Pure, so the drag can say where every other
 * tile will be before the finger lets go.
 */
export function packTiles(tiles: readonly MenuTile[]): Slot[] {
  let col = 0;
  let row = 0;
  return tiles.map((t) => {
    const span = t.size === "2x1" ? 2 : 1;
    if (col + span > 2) {
      row += 1;
      col = 0;
    }
    const slot: Slot = { col: col as 0 | 1, row, span };
    col += span;
    if (col >= 2) {
      row += 1;
      col = 0;
    }
    return slot;
  });
}

/**
 * How far (in whole columns and rows) each tile moves when the tile with
 * `key` is dropped at index `to`, the dragged one included (it settles there).
 */
export function reflow(
  tiles: readonly MenuTile[],
  key: string,
  to: number
): Map<string, { dc: number; dr: number }> {
  const next = dragTo(tiles, key, to);
  const before = packTiles(tiles);
  const after = packTiles(next);
  const out = new Map<string, { dc: number; dr: number }>();
  tiles.forEach((t, i) => {
    const k = tileKey(t);
    const j = next.findIndex((n) => tileKey(n) === k);
    out.set(k, {
      dc: (after[j]?.col ?? 0) - (before[i]?.col ?? 0),
      dr: (after[j]?.row ?? 0) - (before[i]?.row ?? 0),
    });
  });
  return out;
}
