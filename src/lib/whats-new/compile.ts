/**
 * What's new: the `changelog.d/*.md` fragments and the newest released
 * sections of `CHANGELOG.md` turned into the small feed the app shows
 * (Settings → About, the account menu, the help menu). Reading the releases
 * keeps the feed full after `npm run changelog:collect` empties changelog.d.
 *
 * Pure and deterministic: the same fragments, dates and changelog always give
 * the same feed, byte for byte. `scripts/whats-new.ts` reads the files and their dates
 * from git and writes the result to `public/whats-new.json` before a build.
 */
import { newDate } from "@/lib/date-utils";

/** One `changelog.d` file, with the day it was first committed (UTC). */
export interface WhatsNewFragment {
  /** File name, e.g. `app-icon-picker.md`. */
  name: string;
  text: string;
  /** "YYYY-MM-DD", or null when git could not date it. */
  date: string | null;
  /** The commit time (ISO), only used to order fragments of the same day. */
  at?: string | null;
}

/** A part of a released section: one collected fragment, or hand-written. */
export interface WhatsNewReleasePart {
  /** The fragment's file name from the collector's marker, or null. */
  name: string | null;
  text: string;
  /**
   * When the fragment file was added (ISO), if git still knows. Only orders
   * the parts inside a release, newest first; the entries keep the release's
   * date.
   */
  at?: string | null;
}

/** One `## [x.y.z] — YYYY-MM-DD` section of CHANGELOG.md. */
export interface WhatsNewRelease {
  version: string;
  /** "YYYY-MM-DD", from the heading. */
  date: string;
  parts: WhatsNewReleasePart[];
}

export interface WhatsNewEntry {
  /**
   * Stable: the fragment's slug and the bullet's position in it, the same
   * before and after the fragment is collected into a release. A hand-written
   * release bullet is `v<version>-<n>`.
   */
  id: string;
  text: string;
}

export interface WhatsNewGroup {
  /** "YYYY-MM-DD"; null holds the undated fragments, always last. */
  date: string | null;
  entries: WhatsNewEntry[];
}

export interface WhatsNewFeed {
  version: 1;
  groups: WhatsNewGroup[];
}

export const EMPTY_FEED: WhatsNewFeed = { version: 1, groups: [] };

/** The feed never lists more than this many entries, newest first. */
export const MAX_ENTRIES = 120;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Released sections dated before this belong to the upstream project, from
 * before Needt forked it; they are not Needt news.
 */
export const RELEASES_SINCE = "2026-10-01";

const RELEASE_HEADING =
  /^##\s+\[(\d+\.\d+\.\d+[^\]]*)\]\s*(?:[—–-]\s*)?\[?(\d{4}-\d{2}-\d{2})?/;
/** `scripts/changelog-collect.mjs` writes these around collected fragments. */
const SOURCE_MARK = /^<!--\s*changelog\.d\/([^\s/]+\.md)\s*-->$/;
const SOURCE_END = /^<!--\s*\/changelog\.d\s*-->$/;

/** Markdown inline marks out, so the line reads as plain text. */
export function plainText(md: string) {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A fragment's entries: each `- ` bullet is one, its indented lines continue
 * it. Text that is not a bullet (some fragments are one paragraph) is one
 * entry per paragraph.
 */
export function parseFragment(text: string): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  const flush = () => {
    if (cur) {
      const line = plainText(cur.join(" "));
      if (line) out.push(line);
    }
    cur = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^<!--.*-->$/.test(line.trim())) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      cur = [bullet[1]];
    } else if (cur) {
      cur.push(line.trim());
    } else {
      cur = [line.trim()];
    }
  }
  flush();
  return out;
}

const slugOf = (name: string) => name.replace(/\.md$/i, "");

/**
 * Markdown fragments other than the README. `chore-*` fragments are
 * internal housekeeping (dead code, build, CI): they stay in CHANGELOG.md but
 * are not shown in the app.
 */
export function isShown(f: Pick<WhatsNewFragment, "name">) {
  const name = f.name.toLowerCase();
  return (
    name.endsWith(".md") && name !== "readme.md" && !name.startsWith("chore-")
  );
}

/** Newest day first, undated last; inside a day newest commit, then name. */
function compareFragments(a: WhatsNewFragment, b: WhatsNewFragment) {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }
  const at = a.at ?? "";
  const bt = b.at ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The dated release sections of CHANGELOG.md from `since` on, in file order
 * (newest first). `## [Unreleased]`, undated sections and older ones are
 * skipped. Text after the collector's `<!-- changelog.d/<name> -->` marker,
 * up to the next marker, belongs to that fragment; the rest is hand-written.
 */
export function parseChangelog(
  md: string,
  since: string = RELEASES_SINCE
): WhatsNewRelease[] {
  const out: WhatsNewRelease[] = [];
  let release: WhatsNewRelease | null = null;
  let name: string | null = null;
  let lines: string[] = [];
  const closePart = () => {
    if (release && lines.some((l) => l.trim())) {
      release.parts.push({ name, text: lines.join("\n") });
    }
    name = null;
    lines = [];
  };
  const closeRelease = () => {
    closePart();
    if (release && release.parts.length > 0) out.push(release);
    release = null;
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (/^##\s/.test(line)) {
      closeRelease();
      const head = RELEASE_HEADING.exec(line);
      const date = head?.[2];
      if (head && date && date >= since) {
        release = { version: head[1].trim(), date, parts: [] };
      }
      continue;
    }
    if (!release) continue;
    const mark = SOURCE_MARK.exec(line.trim());
    if (mark || SOURCE_END.test(line.trim())) {
      closePart();
      name = mark ? mark[1] : null;
      continue;
    }
    lines.push(line);
  }
  closeRelease();
  return out;
}

interface Block {
  date: string | null;
  entries: WhatsNewEntry[];
}

/** Released entries, minus `chore-*` fragments and text already listed. */
function releaseBlocks(
  releases: readonly WhatsNewRelease[],
  ids: Set<string>,
  texts: Set<string>
): Block[] {
  const blocks: Block[] = [];
  for (const r of releases) {
    if (!DAY.test(r.date)) continue;
    const entries: WhatsNewEntry[] = [];
    let loose = 0;
    // Dated parts newest first, then the rest in file order (sort is stable).
    const parts = [...r.parts].sort((a, b) => {
      const at = a.at ?? "";
      const bt = b.at ?? "";
      if (at === bt) return 0;
      if (!at) return 1;
      if (!bt) return -1;
      return at < bt ? 1 : -1;
    });
    for (const p of parts) {
      if (p.name !== null && !isShown({ name: p.name })) continue;
      const slug = p.name === null ? null : slugOf(p.name);
      parseFragment(p.text).forEach((text, i) => {
        let id =
          slug === null ? `v${r.version}-${++loose}` : `${slug}-${i + 1}`;
        if (ids.has(id)) id = `v${r.version}-${id}`;
        if (texts.has(text) || ids.has(id)) return;
        texts.add(text);
        ids.add(id);
        entries.push({ id, text });
      });
    }
    if (entries.length > 0) blocks.push({ date: r.date, entries });
  }
  return blocks;
}

export interface CompileOptions {
  /** CHANGELOG.md release sections, newest first (`parseChangelog`). */
  releases?: readonly WhatsNewRelease[];
  maxEntries?: number;
}

export function compileWhatsNew(
  fragments: readonly WhatsNewFragment[],
  { releases = [], maxEntries = MAX_ENTRIES }: CompileOptions = {}
): WhatsNewFeed {
  const sorted = fragments
    .filter(isShown)
    .map((f) => ({ ...f, date: f.date && DAY.test(f.date) ? f.date : null }))
    .sort(compareFragments);
  const ids = new Set<string>();
  const texts = new Set<string>();
  const blocks: Block[] = sorted.map((f) => {
    const slug = slugOf(f.name);
    const entries = parseFragment(f.text).map((text, i) => {
      const id = `${slug}-${i + 1}`;
      ids.add(id);
      texts.add(text);
      return { id, text };
    });
    return { date: f.date, entries };
  });
  // A release dated the same day as a fragment is older than it (the fragment
  // was added after the collect); the sort is stable, so ties keep this order.
  const merged = [...blocks, ...releaseBlocks(releases, ids, texts)].sort(
    (a, b) => {
      if (a.date === b.date) return 0;
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? 1 : -1;
    }
  );
  const groups: WhatsNewGroup[] = [];
  let count = 0;
  for (const block of merged) {
    if (count >= maxEntries) break;
    const entries = block.entries.slice(0, maxEntries - count);
    if (entries.length === 0) continue;
    let group = groups[groups.length - 1];
    if (!group || group.date !== block.date) {
      group = { date: block.date, entries: [] };
      groups.push(group);
    }
    group.entries.push(...entries);
    count += entries.length;
  }
  return { version: 1, groups };
}

/** A feed read from disk or the network, or the empty one when it is not. */
export function parseFeed(value: unknown): WhatsNewFeed {
  if (!value || typeof value !== "object") return EMPTY_FEED;
  const groups = (value as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return EMPTY_FEED;
  const out: WhatsNewGroup[] = [];
  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    const { date, entries } = g as { date?: unknown; entries?: unknown };
    if (!Array.isArray(entries)) continue;
    const clean = entries.filter(
      (e): e is WhatsNewEntry =>
        !!e &&
        typeof (e as WhatsNewEntry).id === "string" &&
        typeof (e as WhatsNewEntry).text === "string"
    );
    if (clean.length === 0) continue;
    out.push({
      date: typeof date === "string" && DAY.test(date) ? date : null,
      entries: clean.map(({ id, text }) => ({ id, text })),
    });
  }
  return { version: 1, groups: out };
}

/**
 * Commit days from `git log --diff-filter=A --format=%x00%cI --name-only`.
 * The log is newest first, so a file's first sighting is its latest add.
 */
export function datesFromGitLog(
  log: string,
  dir = "changelog.d/"
): Map<string, { date: string; at: string }> {
  const out = new Map<string, { date: string; at: string }>();
  for (const block of log.split("\0")) {
    const lines = block.split("\n").map((l) => l.trim());
    const at = lines.shift() ?? "";
    const when = newDate(at);
    if (!at || Number.isNaN(when.getTime())) continue;
    const iso = when.toISOString();
    for (const file of lines) {
      if (!file.startsWith(dir)) continue;
      const name = file.slice(dir.length);
      if (!name || name.includes("/") || out.has(name)) continue;
      out.set(name, { date: iso.slice(0, 10), at: iso });
    }
  }
  return out;
}
