/**
 * What's new: the `changelog.d/*.md` fragments turned into the small feed the
 * app shows (Settings → About, the account menu, the help menu).
 *
 * Pure and deterministic: the same fragments and dates always give the same
 * feed, byte for byte. `scripts/whats-new.ts` reads the files and their dates
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

export interface WhatsNewEntry {
  /** Stable: the fragment's slug and the bullet's position in it. */
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

export function compileWhatsNew(
  fragments: readonly WhatsNewFragment[],
  maxEntries = MAX_ENTRIES
): WhatsNewFeed {
  const sorted = fragments
    .filter(isShown)
    .map((f) => ({ ...f, date: f.date && DAY.test(f.date) ? f.date : null }))
    .sort(compareFragments);
  const groups: WhatsNewGroup[] = [];
  let count = 0;
  for (const f of sorted) {
    if (count >= maxEntries) break;
    const lines = parseFragment(f.text).slice(0, maxEntries - count);
    if (lines.length === 0) continue;
    let group = groups[groups.length - 1];
    if (!group || group.date !== f.date) {
      group = { date: f.date, entries: [] };
      groups.push(group);
    }
    const slug = slugOf(f.name);
    lines.forEach((text, i) =>
      group.entries.push({ id: `${slug}-${i + 1}`, text })
    );
    count += lines.length;
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
