/**
 * Docs grid sorting (prototype doc-style.jsx 324–373). Craft's order in the
 * ⋯ menu: Name, Last viewed, Date created, Date updated. Clicking the active
 * row flips its direction; another row takes its default (A→Z for Name,
 * newest first for dates). The choice is a per-browser convenience
 * (`needt.docsSort` in localStorage), not a synced preference.
 */

export type DocSortKey = "name" | "viewed" | "created" | "updated";
export type SortDir = "asc" | "desc";

export interface DocSort {
  key: DocSortKey;
  dir: SortDir;
}

export const DOC_SORTS: [DocSortKey, string][] = [
  ["name", "Name"],
  ["viewed", "Last viewed"],
  ["created", "Date created"],
  ["updated", "Date updated"],
];

export const DEFAULT_SORT: DocSort = { key: "updated", dir: "desc" };

export const sortDefault = (key: DocSortKey): SortDir =>
  key === "name" ? "asc" : "desc";

export const dirLabel = (key: DocSortKey, dir: SortDir) =>
  key === "name"
    ? dir === "asc"
      ? "A to Z"
      : "Z to A"
    : dir === "desc"
      ? "Newest first"
      : "Oldest first";

/** The next sort after choosing `key` (the active key flips direction). */
export function nextSort(cur: DocSort, key: DocSortKey): DocSort {
  if (cur.key === key) {
    return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: sortDefault(key) };
}

export interface SortableDoc {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  viewedAt?: string | null;
}

/** ISO stamp → epoch ms; a missing or bad stamp sorts as the oldest. */
const time = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

/**
 * Sort a copy; ties keep their incoming order. "Last viewed" reads
 * `viewedAt` and falls back to `updatedAt` until the API sends a per-person
 * view time.
 */
export function sortDocs<T extends SortableDoc>(
  list: readonly T[],
  { key, dir }: DocSort
): T[] {
  const val = (d: T): string | number =>
    key === "name"
      ? (d.title || "￿").toLowerCase()
      : key === "created"
        ? time(d.createdAt)
        : key === "viewed"
          ? time(d.viewedAt ?? d.updatedAt)
          : time(d.updatedAt);
  return list
    .map((d, i) => ({ d, v: val(d), i }))
    .sort((a, b) => {
      let c =
        typeof a.v === "string"
          ? a.v.localeCompare(b.v as string)
          : a.v === b.v
            ? 0
            : (a.v as number) < (b.v as number)
              ? -1
              : 1;
      if (dir === "desc") c = -c;
      return c || a.i - b.i;
    })
    .map((x) => x.d);
}

export const SORT_STORAGE_KEY = "needt.docsSort";

/** A stored value, or the default when it is missing or malformed. */
export function parseSort(raw: string | null | undefined): DocSort {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<DocSort>) : null;
    if (
      v &&
      DOC_SORTS.some(([k]) => k === v.key) &&
      (v.dir === "asc" || v.dir === "desc")
    ) {
      return { key: v.key as DocSortKey, dir: v.dir };
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_SORT;
}

export function readSort(): DocSort {
  try {
    return parseSort(window.localStorage.getItem(SORT_STORAGE_KEY));
  } catch {
    return DEFAULT_SORT;
  }
}

export function writeSort(v: DocSort) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(v));
  } catch {
    // private mode or blocked storage: the sort lasts for this visit
  }
}
