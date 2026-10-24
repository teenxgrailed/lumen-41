/**
 * Which What's new entries a person has not seen yet.
 *
 * `prefs.whatsNewSeen` holds the newest day the person has opened and the
 * entries that day had, so an entry added later on the same day still counts
 * as new. Before the first opening the baseline is the day the account was
 * created: a new account starts with nothing to catch up on. Undated entries
 * (a build without git history) never count as new.
 */
import type { WhatsNewFeed } from "./compile";

export const SEEN_PREF = "whatsNewSeen";

export interface WhatsNewSeen {
  /** "YYYY-MM-DD" of the newest day opened. */
  date: string;
  /** The entries that day had when it was opened. */
  ids: string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseSeen(value: unknown): WhatsNewSeen | null {
  if (!value || typeof value !== "object") return null;
  const { date, ids } = value as { date?: unknown; ids?: unknown };
  if (typeof date !== "string" || !DAY.test(date)) return null;
  return {
    date,
    ids: Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/**
 * The ids of the entries not seen yet, newest first. `since` is the account's
 * first day ("YYYY-MM-DD"), used only while nothing has been opened; null
 * there means every dated entry is new.
 */
export function unseenIds(
  feed: WhatsNewFeed,
  seen: WhatsNewSeen | null,
  since: string | null
): string[] {
  const out: string[] = [];
  for (const group of feed.groups) {
    if (!group.date) continue;
    for (const entry of group.entries) {
      const fresh = seen
        ? group.date > seen.date ||
          (group.date === seen.date && !seen.ids.includes(entry.id))
        : since === null || group.date > since;
      if (fresh) out.push(entry.id);
    }
  }
  return out;
}

/** What to store once the person has opened the feed: its newest day. */
export function seenMarker(feed: WhatsNewFeed): WhatsNewSeen | null {
  const newest = feed.groups.find((g) => g.date !== null);
  if (!newest?.date) return null;
  return { date: newest.date, ids: newest.entries.map((e) => e.id) };
}
