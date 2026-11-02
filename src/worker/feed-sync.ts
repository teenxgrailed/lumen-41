import type { CalendarFeed, ConnectedAccount } from "@prisma/client";

import { CalDAVCalendarService } from "@/lib/caldav-calendar";
import { updateCalendarFeedSyncState } from "@/lib/calendar-db";
import { newDate } from "@/lib/date-utils";
import { syncGoogleCalendar } from "@/lib/google-sync";
import { getOutlookClient } from "@/lib/outlook-calendar";
import { syncOutlookCalendar } from "@/lib/outlook-sync";

export type SyncableFeed = CalendarFeed & {
  userId: string;
  url: string;
  account: ConnectedAccount;
};

/** Run one provider sync for a feed; each provider records its own state. */
export async function syncFeedByType(feed: SyncableFeed) {
  if (feed.type === "CALDAV") {
    await new CalDAVCalendarService(feed.account).syncCalendar(
      feed.id,
      feed.url,
      feed.userId
    );
    await updateCalendarFeedSyncState(feed.id, {
      lastSync: newDate(),
      error: null,
    });
  } else if (feed.type === "OUTLOOK") {
    const client = await getOutlookClient(feed.account.id, feed.userId);
    const result = await syncOutlookCalendar(
      client,
      { id: feed.id, url: feed.url },
      feed.syncToken
    );
    await updateCalendarFeedSyncState(feed.id, {
      lastSync: newDate(),
      syncToken: result.nextSyncToken ?? feed.syncToken,
      error: null,
    });
  } else if (feed.type === "GOOGLE") {
    await syncGoogleCalendar(feed);
  } else {
    throw new Error(`Unsupported calendar feed type: ${feed.type}`);
  }
}
