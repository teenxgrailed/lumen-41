/* WHAT INTERRUPTS — the feed's rows filtered through Settings → Notifications
 * for one channel. The Mac app polls `alertsSince` (it has no Web Push), the
 * worker uses `digestSummary` for the morning digest. The bell itself always
 * shows everything; this only decides what also taps the person on the
 * shoulder.
 */
import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";

import { type FeedItem, getNotificationFeed } from "./feed";
import {
  type NotificationChannel,
  type NotificationPrefs,
  digestMoment,
  getNotificationPrefs,
  shouldAlert,
  typeOfFeedKind,
} from "./preferences";

export interface AlertItem {
  key: string;
  title: string;
  body: string | null;
  link: string;
  at: string;
  kind: string;
}

export interface AlertsPage {
  items: AlertItem[];
  /** Pass as `since` next time. */
  now: string;
}

function toAlert(item: FeedItem): AlertItem {
  return {
    key: item.key,
    title: item.title,
    body: item.body,
    link: item.link,
    at: item.at,
    kind: item.kind,
  };
}

/** "3 reminders · 2 overdue · 1 mention" — or null when nothing waits. */
export function digestSummary(items: Pick<FeedItem, "kind" | "unread">[]): {
  title: string;
  body: string;
} | null {
  const unread = items.filter((i) => i.unread);
  if (!unread.length) return null;
  const counts = new Map<string, number>();
  for (const item of unread) {
    const type = typeOfFeedKind(item.kind);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const words: [string, string, string][] = [
    ["reminder", "reminder", "reminders"],
    ["overdue", "overdue", "overdue"],
    ["mention", "mention or share", "mentions and shares"],
    ["system", "update", "updates"],
  ];
  const parts = words
    .filter(([type]) => counts.get(type))
    .map(([type, one, many]) => {
      const n = counts.get(type) ?? 0;
      return `${n} ${n === 1 ? one : many}`;
    });
  return { title: "Your morning in Needt", body: parts.join(" · ") };
}

/** The rows of `items` that may interrupt on `channel` at `now`. */
export function alertable(
  items: FeedItem[],
  prefs: NotificationPrefs,
  channel: NotificationChannel,
  since: Date,
  now: Date
): FeedItem[] {
  return items.filter((item) => {
    if (!item.unread) return false;
    const at = newDate(item.at);
    if (at <= since || at > now) return false;
    return shouldAlert(prefs, typeOfFeedKind(item.kind), channel, now);
  });
}

export async function alertsSince(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  channel: NotificationChannel;
  since: Date | null;
  now?: Date;
}): Promise<AlertsPage> {
  const now = input.now ?? newDate();
  // The first poll only sets the baseline: nothing old is replayed.
  if (!input.since) return { items: [], now: now.toISOString() };
  const [prefs, feed] = await Promise.all([
    getNotificationPrefs(input.userId),
    getNotificationFeed({
      userId: input.userId,
      workspace: input.workspace,
      group: "activity",
      limit: 50,
      now,
    }),
  ]);
  const items = alertable(feed.items, prefs, input.channel, input.since, now)
    .slice(0, 5)
    .map(toAlert);
  if (
    prefs.digest &&
    input.channel !== "inApp" &&
    prefs[input.channel === "mac" ? "channelMac" : "channelPush"]
  ) {
    const moment = digestMoment(prefs, now);
    const summary = digestSummary(feed.items);
    if (summary && input.since < moment && moment <= now) {
      items.push({
        key: `digest:${moment.toISOString().slice(0, 10)}`,
        title: summary.title,
        body: summary.body,
        link: "/today",
        at: moment.toISOString(),
        kind: "digest",
      });
    }
  }
  return { items, now: now.toISOString() };
}
