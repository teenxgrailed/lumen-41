import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { calendarProviderNeedsReconnect } from "@/lib/calendar-connection-status";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { nextSyncAttemptAfterFailure } from "@/lib/sync-backoff";

import {
  AttendeeStatus,
  CalendarEventWithFeed,
  EventStatus,
  ValidatedEvent,
} from "@/types/calendar";

export interface CalendarEventSyncInput {
  externalEventId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  allDay: boolean;
  status?: string;
  sequence?: number;
  created?: Date;
  lastModified?: Date;
  organizer?: Prisma.InputJsonValue;
  attendees?: Prisma.InputJsonValue;
  recurringEventId?: string;
  /** Free / transparent upstream: does not block scheduling. */
  transparent?: boolean;
  /** The account owner declined the invitation. */
  selfDeclined?: boolean;
}

export interface CalendarWebhookInput {
  provider: "GOOGLE" | "OUTLOOK";
  feedId: string;
  channelId?: string;
  subscriptionId?: string;
  resourceId?: string;
  expiration: Date;
  clientState?: string;
  channelToken?: string;
}

export async function getCalendarFeedForSync(feedId: string) {
  return prisma.calendarFeed.findUnique({
    where: { id: feedId },
    include: { account: true },
  });
}

/** Feeds whose backoff (set after a failed sync) has passed. */
function outOfBackoff(now: Date): Prisma.CalendarFeedWhereInput {
  return {
    OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: now } }],
  };
}

/** Oldest last attempt first (a failed attempt counts), never-tried first. */
const OLDEST_ATTEMPT_FIRST: Prisma.CalendarFeedOrderByWithRelationInput[] = [
  { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
  { lastSync: { sort: "asc", nulls: "first" } },
];

/**
 * Enabled CALDAV feeds that can be synced (an owner, a URL and a login), were
 * not synced in the last `staleAfterMs`, and are not backing off after a
 * failure. At most `limit`, oldest attempt first, so a big backlog drains over
 * several runs instead of one burst.
 */
export async function listCalDavFeedIdsForSweep(
  staleAfterMs = 0,
  limit = 50
): Promise<string[]> {
  const now = newDate();
  const feeds = await prisma.calendarFeed.findMany({
    where: {
      type: "CALDAV",
      enabled: true,
      userId: { not: null },
      url: { not: null },
      accountId: { not: null },
      AND: [
        outOfBackoff(now),
        {
          OR: [
            { lastSync: null },
            { lastSync: { lt: newDate(now.getTime() - staleAfterMs) } },
          ],
        },
      ],
    },
    orderBy: OLDEST_ATTEMPT_FIRST,
    take: limit,
    select: { id: true },
  });
  return feeds.map((feed) => feed.id);
}

/**
 * Enabled Google and Outlook feeds that were never synced, or not for
 * `staleAfterMs`. They normally update from push webhooks, which only fire on
 * changes: a new feed, a missed webhook or an expired channel leaves them
 * empty. Never-synced feeds come first; the batch is small on purpose.
 */
export async function listStaleWebhookFeedIds(
  staleAfterMs: number,
  limit: number
): Promise<string[]> {
  const now = newDate();
  const feeds = await prisma.calendarFeed.findMany({
    where: {
      AND: [outOfBackoff(now)],
      type: { in: ["GOOGLE", "OUTLOOK"] },
      enabled: true,
      userId: { not: null },
      url: { not: null },
      accountId: { not: null },
      OR: [
        { lastSync: null },
        { lastSync: { lt: newDate(newDate().getTime() - staleAfterMs) } },
      ],
    },
    orderBy: OLDEST_ATTEMPT_FIRST,
    take: limit,
    select: { id: true },
  });
  return feeds.map((feed) => feed.id);
}

export async function updateCalendarFeedSyncState(
  feedId: string,
  data: { lastSync?: Date; syncToken?: string | null; error?: string | null }
) {
  return prisma.calendarFeed.update({
    where: { id: feedId },
    // A successful sync (it stamps lastSync) is also the latest attempt and
    // ends any backoff.
    data: data.lastSync
      ? {
          ...data,
          lastSyncAttemptAt: data.lastSync,
          syncFailureCount: 0,
          nextSyncAttemptAt: null,
        }
      : data,
  });
}

/** Errors already recorded, so a rethrow through two layers counts once. */
const recordedFailures = new WeakSet<object>();

/**
 * A sync failed: keep the error, stamp the attempt, count the failure and set
 * when the sweeps may try again (exponential; a day when the sign-in was
 * revoked, which the account then shows as needing a reconnect). Never throws:
 * the caller is already handling the original error.
 */
export async function recordCalendarFeedSyncFailure(
  feedId: string,
  error: unknown
): Promise<void> {
  if (typeof error === "object" && error !== null) {
    if (recordedFailures.has(error)) return;
    recordedFailures.add(error);
  }
  const message = error instanceof Error ? error.message : String(error);
  const now = newDate();
  try {
    const updated = await prisma.calendarFeed.update({
      where: { id: feedId },
      data: {
        error: message,
        lastSyncAttemptAt: now,
        syncFailureCount: { increment: 1 },
      },
      select: { syncFailureCount: true },
    });
    await prisma.calendarFeed.update({
      where: { id: feedId },
      data: {
        nextSyncAttemptAt: nextSyncAttemptAfterFailure(
          now,
          updated.syncFailureCount,
          calendarProviderNeedsReconnect(error)
        ),
      },
    });
  } catch (recordError) {
    await logger.warn(
      "Could not record calendar feed sync failure",
      {
        feedId,
        error:
          recordError instanceof Error
            ? recordError.message
            : String(recordError),
      },
      "CalendarDb"
    );
  }
}

export async function persistGoogleCalendarEvents(options: {
  feedId: string;
  events: CalendarEventSyncInput[];
  deletedExternalIds?: string[];
  replaceAll?: boolean;
}): Promise<void> {
  const {
    feedId,
    events,
    deletedExternalIds = [],
    replaceAll = false,
  } = options;

  await prisma.$transaction(
    async (tx) => {
      if (replaceAll) {
        const receivedExternalIds = events.map(
          (event) => event.externalEventId
        );
        await tx.calendarEvent.updateMany({
          where: {
            feedId,
            archivedAt: null,
            externalEventId:
              receivedExternalIds.length > 0
                ? { notIn: receivedExternalIds }
                : { not: null },
          },
          data: { archivedAt: newDate() },
        });
      } else if (deletedExternalIds.length > 0) {
        await tx.calendarEvent.updateMany({
          where: {
            feedId,
            archivedAt: null,
            externalEventId: { in: deletedExternalIds },
          },
          data: { archivedAt: newDate() },
        });
      }

      for (const event of events) {
        const existing = await tx.calendarEvent.findFirst({
          where: { feedId, externalEventId: event.externalEventId },
          select: { id: true, archivedAt: true },
        });
        const data = {
          ...event,
          feedId,
          isMaster: false,
          masterEventId: null,
        };

        if (existing?.archivedAt) {
          continue;
        }
        if (existing) {
          await tx.calendarEvent.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await tx.calendarEvent.create({ data });
        }
      }
    },
    { timeout: 30_000 }
  );
}

export async function upsertCalendarWebhook(input: CalendarWebhookInput) {
  return prisma.calendarWebhook.upsert({
    where: {
      provider_feedId: {
        provider: input.provider,
        feedId: input.feedId,
      },
    },
    update: input,
    create: input,
  });
}

export async function getCalendarWebhookForFeed(
  provider: "GOOGLE" | "OUTLOOK",
  feedId: string
) {
  return prisma.calendarWebhook.findUnique({
    where: { provider_feedId: { provider, feedId } },
    include: { feed: { include: { account: true } } },
  });
}

export async function findGoogleWebhook(channelId: string, resourceId: string) {
  return prisma.calendarWebhook.findFirst({
    where: {
      provider: "GOOGLE",
      channelId,
      resourceId,
    },
    include: { feed: true },
  });
}

export async function findOutlookWebhook(subscriptionId: string) {
  return prisma.calendarWebhook.findFirst({
    where: {
      provider: "OUTLOOK",
      subscriptionId,
    },
    include: { feed: true },
  });
}

export async function listCalendarWebhooks(options?: {
  provider?: "GOOGLE" | "OUTLOOK";
  feedId?: string;
}) {
  return prisma.calendarWebhook.findMany({
    where: {
      provider: options?.provider,
      feedId: options?.feedId,
    },
    include: { feed: { include: { account: true } } },
  });
}

export async function listPushEnabledCalendarFeeds() {
  return prisma.calendarFeed.findMany({
    where: {
      enabled: true,
      type: { in: ["GOOGLE", "OUTLOOK"] },
      accountId: { not: null },
      userId: { not: null },
      url: { not: null },
    },
    select: {
      id: true,
      type: true,
      webhooks: { select: { id: true } },
    },
  });
}

export async function deleteCalendarWebhook(
  provider: "GOOGLE" | "OUTLOOK",
  feedId: string
): Promise<void> {
  await prisma.calendarWebhook.deleteMany({ where: { provider, feedId } });
}

export async function getEvent(
  eventId: string
): Promise<CalendarEventWithFeed | null> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, archivedAt: null, feed: { enabled: true } },
    include: { feed: true },
  });

  if (!event) return null;

  // Map Prisma result to our CalendarEventWithFeed type
  return {
    ...event,
    externalEventId: event.externalEventId || undefined,
    description: event.description || undefined,
    location: event.location || undefined,
    recurrenceRule: event.recurrenceRule || undefined,
    sequence: event.sequence || undefined,
    status: (event.status as EventStatus) || undefined,
    created: event.created || undefined,
    lastModified: event.lastModified || undefined,
    organizer: event.organizer as { name?: string; email?: string } | undefined,
    attendees: event.attendees as
      | Array<{ name?: string; email: string; status?: AttendeeStatus }>
      | undefined,
    masterEventId: event.masterEventId || undefined,
    recurringEventId: event.recurringEventId || undefined,
    feed: {
      ...event.feed,
      type: event.feed.type as "GOOGLE" | "OUTLOOK" | "CALDAV",
      url: event.feed.url || undefined,
      color: event.feed.color || undefined,
      lastSync: event.feed.lastSync || undefined,
      error: event.feed.error || undefined,
      caldavPath: event.feed.caldavPath || undefined,
      accountId: event.feed.accountId || undefined,
      syncToken: event.feed.syncToken || undefined,
      userId: event.feed.userId || undefined,
    },
  };
}

export async function validateEvent(
  event: CalendarEventWithFeed | null,
  provider: "GOOGLE" | "OUTLOOK" | "CALDAV"
): Promise<ValidatedEvent | NextResponse> {
  if (!event || !event.feed || !event.feed.accountId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.feed.type !== provider) {
    return NextResponse.json(
      { error: `Not a ${provider} Calendar event` },
      { status: 400 }
    );
  }

  // For CalDAV, we need either a URL or a caldavPath
  if (provider === "CALDAV" && !event.feed.caldavPath && !event.feed.url) {
    return NextResponse.json(
      { error: "No CalDAV calendar path found" },
      { status: 400 }
    );
  } else if (provider !== "CALDAV" && !event.feed.url) {
    return NextResponse.json(
      { error: "No calendar URL found" },
      { status: 400 }
    );
  }

  if (!event.externalEventId) {
    return NextResponse.json(
      { error: `No ${provider} Calendar event ID found` },
      { status: 400 }
    );
  }

  return event as ValidatedEvent;
}

export async function deleteCalendarEvent(
  eventId: string,
  mode: "single" | "series" = "single"
) {
  const event = await getEvent(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  if (mode === "series") {
    // Archive the event and its related instances so the operation is
    // recoverable and relations/history remain intact.
    if (event.isMaster || !event.masterEventId) {
      await prisma.calendarEvent.updateMany({
        where: {
          OR: [{ id: event.id }, { masterEventId: event.id }],
        },
        data: { archivedAt: newDate() },
      });
    } else {
      const masterEvent = await prisma.calendarEvent.findFirst({
        where: {
          id: event.masterEventId,
        },
      });
      if (masterEvent) {
        await prisma.calendarEvent.updateMany({
          where: {
            OR: [{ id: masterEvent.id }, { masterEventId: masterEvent.id }],
          },
          data: { archivedAt: newDate() },
        });
      }
    }
  } else {
    await prisma.calendarEvent.update({
      where: {
        id: event.id,
      },
      data: { archivedAt: newDate() },
    });
  }

  return event;
}
