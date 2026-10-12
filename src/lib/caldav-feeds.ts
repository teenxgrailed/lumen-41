import {
  createCalDAVClient,
  fetchCalDAVCalendars,
  loginToCalDAVServer,
} from "@/app/api/calendar/caldav/utils";
import type { ConnectedAccount } from "@prisma/client";

import { CalDAVCalendarService } from "@/lib/caldav-calendar";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueCalendarSync, isQueueConfigured } from "@/lib/queue/enqueue";
import { decryptSecret } from "@/lib/security/secret-encryption";

const LOG_SOURCE = "CalDAVFeeds";

interface DiscoveredCalendar {
  url: string;
  displayName?: unknown;
  calendarColor?: unknown;
  syncToken?: unknown;
  components?: string[];
}

/** A calendar that holds events (iCloud also lists Reminders = VTODO only). */
export const holdsEvents = (c: Pick<DiscoveredCalendar, "components">) =>
  !c.components?.length || c.components.includes("VEVENT");

export interface AddFeedsDeps {
  discover?: (account: ConnectedAccount) => Promise<DiscoveredCalendar[]>;
  sync?: (feedId: string, url: string) => Promise<void>;
}

async function discoverCalendars(
  account: ConnectedAccount
): Promise<DiscoveredCalendar[]> {
  if (!account.caldavUrl || !account.caldavUsername || !account.accessToken)
    throw new Error("CalDAV account is missing its URL or credentials");
  const client = createCalDAVClient(
    account.caldavUrl,
    account.caldavUsername,
    decryptSecret(account.accessToken)
  );
  await loginToCalDAVServer(client, account.caldavUrl, account.caldavUsername);
  return (await fetchCalDAVCalendars(client)) as DiscoveredCalendar[];
}

/**
 * Adds every event calendar of a CalDAV account as a feed and starts its first
 * sync — what the Google callback does for Google. Without it a freshly
 * connected Apple / iCloud account had no feeds, so nothing ever synced and
 * the calendar stayed empty. Calendars already added are skipped. The sync
 * goes to the worker when the queue is configured (the cron is the safety
 * net), else it runs here; a failed sync is recorded on the feed, never
 * thrown, so the account stays connected.
 */
export async function addCalDAVFeeds(
  account: ConnectedAccount,
  userId: string,
  deps: AddFeedsDeps = {}
): Promise<{ added: string[] }> {
  const discover = deps.discover ?? discoverCalendars;
  const calendars = (await discover(account)).filter(holdsEvents);
  const existing = await prisma.calendarFeed.findMany({
    where: { accountId: account.id, type: "CALDAV", userId },
    select: { url: true },
  });
  const have = new Set(existing.map((f) => f.url));
  const added: { id: string; url: string }[] = [];

  for (const cal of calendars) {
    if (!cal.url || have.has(cal.url)) continue;
    const feed = await prisma.calendarFeed.create({
      data: {
        name:
          typeof cal.displayName === "string" && cal.displayName
            ? cal.displayName
            : "Unnamed Calendar",
        color:
          typeof cal.calendarColor === "string" ? cal.calendarColor : "#4285F4",
        type: "CALDAV",
        url: cal.url,
        accountId: account.id,
        userId,
        enabled: true,
        syncToken: cal.syncToken ? String(cal.syncToken) : null,
      },
    });
    have.add(cal.url);
    added.push({ id: feed.id, url: cal.url });
  }

  await Promise.all(
    added.map(async ({ id: feedId, url }) => {
      try {
        if (deps.sync) await deps.sync(feedId, url);
        else if (isQueueConfigured()) await enqueueCalendarSync(feedId);
        else {
          await new CalDAVCalendarService(account).syncCalendar(
            feedId,
            url,
            userId
          );
          await prisma.calendarFeed.update({
            where: { id: feedId },
            data: { lastSync: newDate(), error: null },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          "First sync of a CalDAV calendar failed",
          { feedId, error: message },
          LOG_SOURCE
        );
        await prisma.calendarFeed
          .update({ where: { id: feedId }, data: { error: message } })
          .catch(() => undefined);
      }
    })
  );

  return { added: added.map((a) => a.id) };
}
