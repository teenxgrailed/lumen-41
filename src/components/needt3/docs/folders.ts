/**
 * Docs as folders: the documents the screen already loaded, grouped by
 * project. The group is the folder: its first sheets are the three most
 * recently updated pages, the count is its pages, the caption says when the
 * newest one changed. Pages with no project (or whose project is gone) sit
 * in "Unsorted". Pure, so it is tested apart from the DOM; no request is
 * made here.
 */
import type { V3Doc, V3Project } from "@/lib/needt3/map";

import { ageLabel } from "./labels";

/** The key of the group of pages that belong to no project. */
export const UNSORTED = "unsorted";

export interface DocGroup {
  /** A project id, or `UNSORTED`. */
  key: string;
  label: string;
  /** The project colour (raw), or null. */
  color: string | null;
  /** Newest update first. */
  docs: V3Doc[];
}

export interface DocFolderModel {
  key: string;
  label: string;
  count: number;
  caption?: string;
  hue: string | null;
  peeks: { key: string; title: string; meta?: string }[];
}

const time = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

/** Newest update first; ties keep their incoming order. */
function byUpdated(docs: readonly V3Doc[]): V3Doc[] {
  return docs
    .map((d, i) => ({ d, t: time(d.updatedAt), i }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : a.t < b.t ? 1 : -1))
    .map((x) => x.d);
}

/**
 * Group live documents by project. Folders with no pages are left out; they
 * run newest-changed first with Unsorted last.
 */
export function groupDocs(
  docs: readonly V3Doc[],
  projects: readonly Pick<V3Project, "id" | "name" | "color">[]
): DocGroup[] {
  const byId = new Map(projects.map((p) => [p.id, p] as const));
  const buckets = new Map<string, V3Doc[]>();
  for (const d of docs) {
    const key = d.projectId && byId.has(d.projectId) ? d.projectId : UNSORTED;
    const list = buckets.get(key);
    if (list) list.push(d);
    else buckets.set(key, [d]);
  }
  const groups: DocGroup[] = [];
  for (const [key, list] of buckets) {
    const p = byId.get(key);
    groups.push({
      key,
      label: p ? p.name : "Unsorted",
      color: p ? p.color : null,
      docs: byUpdated(list),
    });
  }
  const newest = (g: DocGroup) => time(g.docs[0]?.updatedAt);
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      if (a.g.key === UNSORTED) return 1;
      if (b.g.key === UNSORTED) return -1;
      const x = newest(a.g);
      const y = newest(b.g);
      return x === y ? a.i - b.i : x < y ? 1 : -1;
    })
    .map((x) => x.g);
}

/** "Updated 5 min ago", "Updated yesterday", "Updated 3 Nov"; none without a stamp. */
export function updatedCaption(
  iso: string | null | undefined,
  now: number
): string | undefined {
  const age = ageLabel(iso, now);
  if (!age) return undefined;
  const word =
    age === "Just now" || age === "Yesterday" ? age.toLowerCase() : age;
  return `Updated ${word}`;
}

export function folderModel(group: DocGroup, now: number): DocFolderModel {
  return {
    key: group.key,
    label: group.label,
    count: group.docs.length,
    caption: updatedCaption(group.docs[0]?.updatedAt, now),
    hue: group.color,
    peeks: group.docs.slice(0, 3).map((d) => ({
      key: d.id,
      title: d.title || "Untitled",
      meta: ageLabel(d.updatedAt, now) || undefined,
    })),
  };
}

/**
 * Whether the top level is folders. One group alone would be a single folder
 * to open for nothing, so then the list shows straight away.
 */
export const hasFolders = (groups: readonly DocGroup[]) => groups.length > 1;

/** The open group, or null (the top level) when it is gone. */
export const openGroup = (
  groups: readonly DocGroup[],
  key: string | null
): DocGroup | null => (key ? groups.find((g) => g.key === key) : null) ?? null;
