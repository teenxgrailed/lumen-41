import { listStaleWebhookFeedIds } from "@/lib/calendar-db";
import { syncGoogleCalendar } from "@/lib/google-sync";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

import {
  STALE_FEED_AFTER_MS,
  STALE_FEED_BATCH,
  sweepStaleFeeds,
} from "@/worker/feed-sweep";
import { type SyncableFeed, syncFeedByType } from "@/worker/feed-sync";

jest.mock("@/lib/calendar-db", () => ({
  listStaleWebhookFeedIds: jest.fn(),
  updateCalendarFeedSyncState: jest.fn(),
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueCalendarSync: jest.fn() }));
jest.mock("@/lib/google-sync", () => ({ syncGoogleCalendar: jest.fn() }));
jest.mock("@/lib/caldav-calendar", () => ({
  CalDAVCalendarService: jest.fn(),
}));
jest.mock("@/lib/outlook-calendar", () => ({ getOutlookClient: jest.fn() }));
jest.mock("@/lib/outlook-sync", () => ({ syncOutlookCalendar: jest.fn() }));

describe("stale feed sweep", () => {
  it("queues the feeds the lookup returns, never-synced GOOGLE ones included", async () => {
    (listStaleWebhookFeedIds as jest.Mock).mockResolvedValue(["g1", "o1"]);
    expect(await sweepStaleFeeds()).toBe(2);
    expect(listStaleWebhookFeedIds).toHaveBeenCalledWith(
      STALE_FEED_AFTER_MS,
      STALE_FEED_BATCH
    );
    expect(enqueueCalendarSync).toHaveBeenCalledWith("g1");
    expect(enqueueCalendarSync).toHaveBeenCalledWith("o1");
  });
});

describe("calendar sync job routing", () => {
  it("sends GOOGLE feeds to the Google sync", async () => {
    const feed = {
      id: "g1",
      type: "GOOGLE",
      url: "me@example.com",
      userId: "u1",
      syncToken: null,
      account: { id: "a1" },
    } as unknown as SyncableFeed;
    await syncFeedByType(feed);
    expect(syncGoogleCalendar).toHaveBeenCalledWith(feed);
  });
});
