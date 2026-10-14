/**
 * Derivations for the secondary places — Moodboards, Templates, Shared,
 * Trash (prototype places.jsx). Pure, so they are tested apart from the
 * screens. Every date comes in as an argument; nothing here reads the clock.
 */
import {
  calendarDayDifference,
  formatInTimeZone,
  newDate,
} from "@/lib/date-utils";
import type { V3Board } from "@/lib/needt3/map";
import { isSharedWithMe } from "@/lib/needt3/shared";
import { PLAN_LIMITS } from "@/lib/plan-limits";

export { isSharedWithMe };

/** Trash keeps an item this long (owner decision 2026-10-09; no purge job yet). */
export const TRASH_DAYS = 30;

/**
 * Free's moodboard limit, read from the plan table (`@/lib/plan-limits`);
 * never a local constant (places.jsx `PL_FREE_BOARDS` is 1 there too).
 */
export const FREE_BOARDS: number = PLAN_LIMITS.FREE.boards;

/* ---------- moodboards ---------- */

/**
 * A board holds this many references (409 "Moodboard is full" past it).
 * Mirrors MOODBOARD_ITEM_LIMIT in the server's item service, which cannot be
 * imported here (it pulls in Prisma).
 */
export const BOARD_ITEM_LIMIT = 500;
export const BOARD_FULL_TEXT = `This board holds ${BOARD_ITEM_LIMIT} references`;

/**
 * May the caller change a board (rename, delete, add or remove references)?
 * EDITOR and above. An unknown role (not read yet, or the read failed) is
 * not enough: the controls wait for the server to say so.
 */
export function canEditBoard(
  board: Pick<V3Board, "accessRole"> | null | undefined
) {
  return board?.accessRole === "FULL_ACCESS" || board?.accessRole === "EDITOR";
}

export type BoardSortKey = "updated" | "created" | "name";
export interface BoardSort {
  key: BoardSortKey;
  dir: "asc" | "desc";
}

export const BOARD_SORTS: readonly { key: BoardSortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "created", label: "Date created" },
  { key: "updated", label: "Date updated" },
];

/** Date updated, newest first (places.jsx default). */
export const DEFAULT_BOARD_SORT: BoardSort = { key: "updated", dir: "desc" };

/** Each key's natural direction: names A→Z, dates newest first. */
export function naturalDir(key: BoardSortKey): BoardSort["dir"] {
  return key === "name" ? "asc" : "desc";
}

/** Choosing the active key flips it; choosing another starts at its natural direction. */
export function pickBoardSort(cur: BoardSort, key: BoardSortKey): BoardSort {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: naturalDir(key) };
}

/** Read `needt.mbSort` back; anything else is the default. */
export function parseBoardSort(raw: string | null): BoardSort {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<BoardSort>) : null;
    const key = BOARD_SORTS.find((s) => s.key === v?.key)?.key;
    if (key && (v?.dir === "asc" || v?.dir === "desc"))
      return { key, dir: v.dir };
  } catch {
    /* fall through */
  }
  return DEFAULT_BOARD_SORT;
}

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The moment a board last changed. The prototype takes the newest of its
 * creation, its items and its Pinterest sync; the list route sends no items
 * and V3Board has no `updatedAt` yet, so this is creation and sync.
 * //todo: use `updatedAt` once V3Board carries it (the API already sends it).
 */
export function boardUpdated(
  b: Pick<V3Board, "createdAt" | "pinterestSyncedAt">
) {
  return Math.max(time(b.createdAt), time(b.pinterestSyncedAt));
}

export function sortBoards<T extends V3Board>(
  list: readonly T[],
  sort: BoardSort
) {
  const nat = naturalDir(sort.key);
  const flip = sort.dir === nat ? 1 : -1;
  const by = {
    name: (a: T, b: T) =>
      (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      }),
    created: (a: T, b: T) => time(b.createdAt) - time(a.createdAt),
    updated: (a: T, b: T) => boardUpdated(b) - boardUpdated(a),
  }[sort.key];
  return [...list].sort((a, b) => flip * by(a, b));
}

/** "3 boards". */
export function boardCount(n: number) {
  return `${n} ${n === 1 ? "board" : "boards"}`;
}

/** The free plan's gate on a new board. */
export function boardGate(planKind: string | null | undefined, count: number) {
  const free = planKind === "free";
  return {
    atLimit: free && count >= FREE_BOARDS,
    used: count,
    max: free ? FREE_BOARDS : null,
  };
}

/* ---------- templates ---------- */

/** "<template> — 9 Oct": the title a page made from a template starts with. */
export function templatePageTitle(name: string, now: Date, timeZone: string) {
  const day = formatInTimeZone(now, timeZone, "d MMM");
  return `${name.trim() || "Untitled"} — ${day}`;
}

export function templatesMeta(n: number) {
  return n ? `${n} to start from` : "Nothing to start from yet";
}

/* ---------- shared ---------- */

export function sharedMeta(n: number) {
  if (!n) return "Nothing yet";
  return `${n} ${n === 1 ? "page" : "pages"} shared with you`;
}

export const ROLE_LABEL: Record<string, string> = {
  VIEWER: "Can view",
  EDITOR: "Can edit",
  FULL_ACCESS: "Full access",
};

export function roleLabel(role: string | null | undefined) {
  return (role && ROLE_LABEL[role]) || "Can view";
}

/* ---------- trash ---------- */

/** Whole days until Trash lets go of an item; 0 on the last day, never negative. */
export function trashDaysLeft(trashedAt: string, now: Date) {
  const gone = newDate(time(trashedAt));
  const left = TRASH_DAYS - calendarDayDifference(now, gone);
  return Math.min(TRASH_DAYS, Math.max(0, left));
}

/** "Just now" / "today" / "9 Oct", the way the row always said it. */
export function trashAgo(
  trashedAt: string | null,
  now: Date,
  timeZone: string
) {
  const t = trashedAt ? Date.parse(trashedAt) : NaN;
  if (Number.isNaN(t)) return "today";
  const min = (now.getTime() - t) / 60000;
  if (min < 60) return "Just now";
  if (min < 24 * 60) return "today";
  return formatInTimeZone(newDate(t), timeZone, "d MMM");
}

/** "Deleted today · 30 days left". */
export function trashMeta(
  trashedAt: string,
  now: Date,
  timeZone: string,
  extra?: string
) {
  const left = trashDaysLeft(trashedAt, now);
  const when = trashAgo(trashedAt, now, timeZone);
  return [
    `Deleted ${when}`,
    extra,
    left === 0 ? "goes today" : `${left} ${left === 1 ? "day" : "days"} left`,
  ]
    .filter(Boolean)
    .join(" · ");
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The words of a Delete forever / Empty Trash confirm. A permanent delete has
 * no Undo, and the dialog says so; Empty Trash also says what it leaves (tasks
 * have no hard delete yet).
 */
export function trashAskText(
  ask:
    | { kind: "page" | "board"; title: string }
    | { kind: "all"; pages: number; boards: number; tasks: number }
) {
  if (ask.kind !== "all") {
    const name =
      ask.title || (ask.kind === "page" ? "Untitled" : "Untitled moodboard");
    return {
      title: `Delete “${name}” for good?`,
      body:
        ask.kind === "page"
          ? "The page, its text, files and history are deleted. This can’t be undone."
          : "The board, its references, pictures and people are deleted. This can’t be undone.",
      confirm: "Delete forever",
    };
  }
  const parts = [
    ask.pages ? plural(ask.pages, "page", "pages") : null,
    ask.boards ? plural(ask.boards, "moodboard", "moodboards") : null,
  ].filter(Boolean);
  return {
    title: "Empty Trash?",
    body:
      `${parts.join(" and ")} will be deleted for good. This can’t be undone.` +
      (ask.tasks
        ? ` ${plural(ask.tasks, "task", "tasks")} stay in Trash: tasks can’t be deleted for good yet.`
        : ""),
    confirm: "Empty Trash",
  };
}

export function trashSections(counts: {
  pages: number;
  tasks: number;
  boards: number;
}) {
  const filled = [counts.pages, counts.tasks, counts.boards].filter(Boolean);
  return {
    total: counts.pages + counts.tasks + counts.boards,
    /** Headings show once two kinds share the list; a lone Tasks list keeps its own. */
    headings: filled.length > 1,
  };
}

export function referencesLabel(n: number) {
  return `${n} ${n === 1 ? "reference" : "references"}`;
}
