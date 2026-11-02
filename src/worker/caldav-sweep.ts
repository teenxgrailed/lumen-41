import { listCalDavFeedIdsForSweep } from "@/lib/calendar-db";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

export const CALDAV_SYNC_INTERVAL_MS = 15 * 60_000;
/** A feed synced within this long is fresh; the next run skips it. */
export const CALDAV_STALE_AFTER_MS = 10 * 60_000;
/** Feeds queued per run; the rest follow on the next runs, oldest first. */
export const CALDAV_SWEEP_BATCH = 50;

/**
 * CalDAV has no push, so nothing told the worker when a server changed.
 * Webhooks cover Google and Outlook; CalDAV feeds are pulled on a timer.
 */
export async function sweepCalDavFeeds(): Promise<number> {
  const feedIds = await listCalDavFeedIdsForSweep(
    CALDAV_STALE_AFTER_MS,
    CALDAV_SWEEP_BATCH
  );
  await Promise.all(feedIds.map((feedId) => enqueueCalendarSync(feedId)));
  return feedIds.length;
}
