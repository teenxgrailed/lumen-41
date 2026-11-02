import { listStaleWebhookFeedIds } from "@/lib/calendar-db";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

export const STALE_FEED_SWEEP_INTERVAL_MS = 30 * 60_000;
export const STALE_FEED_AFTER_MS = 6 * 60 * 60_000;
export const STALE_FEED_BATCH = 25;

/**
 * Google and Outlook update from push webhooks, which fire only on changes.
 * A feed that was never synced, or whose channel expired, would stay empty
 * forever; re-sync a small batch of them on a timer.
 */
export async function sweepStaleFeeds(): Promise<number> {
  const feedIds = await listStaleWebhookFeedIds(
    STALE_FEED_AFTER_MS,
    STALE_FEED_BATCH
  );
  await Promise.all(feedIds.map((feedId) => enqueueCalendarSync(feedId)));
  return feedIds.length;
}
