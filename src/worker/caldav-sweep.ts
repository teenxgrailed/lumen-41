import { listCalDavFeedIdsForSweep } from "@/lib/calendar-db";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

export const CALDAV_SYNC_INTERVAL_MS = 15 * 60_000;

/**
 * CalDAV has no push, so nothing told the worker when a server changed.
 * Webhooks cover Google and Outlook; CalDAV feeds are pulled on a timer.
 */
export async function sweepCalDavFeeds(): Promise<number> {
  const feedIds = await listCalDavFeedIdsForSweep();
  await Promise.all(feedIds.map((feedId) => enqueueCalendarSync(feedId)));
  return feedIds.length;
}
