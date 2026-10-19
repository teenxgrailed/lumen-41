import { calendar_v3 } from "googleapis";

import {
  CalendarEventSyncInput,
  persistGoogleCalendarEvents,
  updateCalendarFeedSyncState,
} from "@/lib/calendar-db";
import { createAllDayDate, newDate, newDateFromYMD } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GoogleSync";

export interface GoogleSyncFeed {
  id: string;
  url: string | null;
  accountId: string | null;
  userId: string | null;
  syncToken: string | null;
}

function processRecurrenceRule(
  recurrence: string[] | null | undefined,
  startDate?: Date
): string | undefined {
  if (!recurrence?.length) return undefined;
  const rrule = recurrence.find((rule) => rule.startsWith("RRULE:"));
  if (!rrule) return undefined;

  if (rrule.includes("FREQ=YEARLY") && startDate) {
    const hasMonth = rrule.includes("BYMONTH=");
    const hasMonthDay = rrule.includes("BYMONTHDAY=");
    if (!hasMonth || !hasMonthDay) {
      const parts = rrule
        .split(";")
        .filter(
          (part) =>
            !part.startsWith("BYMONTH=") && !part.startsWith("BYMONTHDAY=")
        );
      parts.push(`BYMONTH=${startDate.getMonth() + 1}`);
      parts.push(`BYMONTHDAY=${startDate.getDate()}`);
      return parts.join(";");
    }
  }

  return rrule;
}

async function fetchEventPages(
  calendar: calendar_v3.Calendar,
  params: calendar_v3.Params$Resource$Events$List
) {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const response = await calendar.events.list({ ...params, pageToken });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

async function getRecurringRules(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  events: calendar_v3.Schema$Event[]
): Promise<Map<string, string[]>> {
  const recurringIds = new Set(
    events
      .map((event) => event.recurringEventId)
      .filter((id): id is string => Boolean(id))
  );
  const rules = new Map<string, string[]>();

  for (const eventId of recurringIds) {
    try {
      const master = await calendar.events.get({ calendarId, eventId });
      if (master.data.recurrence?.length) {
        rules.set(eventId, master.data.recurrence);
      }
    } catch (error) {
      await logger.warn(
        "Could not retrieve Google recurring master",
        {
          eventId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }

  return rules;
}

function toCalendarEvent(
  event: calendar_v3.Schema$Event,
  recurringRules: Map<string, string[]>
): CalendarEventSyncInput | null {
  if (!event.id || (!event.start?.dateTime && !event.start?.date)) return null;
  if (!event.end?.dateTime && !event.end?.date) return null;

  const allDay = !event.start.dateTime;
  const start = allDay
    ? createAllDayDate(event.start.date ?? "")
    : newDate(event.start.dateTime ?? event.start.date ?? "");
  const end = allDay
    ? createAllDayDate(event.end.date ?? "")
    : newDate(event.end.dateTime ?? event.end.date ?? "");
  const recurrence =
    event.recurrence ??
    (event.recurringEventId
      ? recurringRules.get(event.recurringEventId)
      : undefined);

  return {
    externalEventId: event.id,
    title: event.summary || "Untitled Event",
    description: event.description ?? undefined,
    start,
    end,
    location: event.location ?? undefined,
    isRecurring: Boolean(event.recurringEventId || recurrence?.length),
    recurringEventId: event.recurringEventId ?? undefined,
    recurrenceRule: processRecurrenceRule(recurrence, start),
    allDay,
    status: event.status ?? undefined,
    transparent: event.transparency === "transparent",
    selfDeclined: Boolean(
      event.attendees?.some(
        (attendee) => attendee.self && attendee.responseStatus === "declined"
      )
    ),
    sequence: event.sequence ?? undefined,
    created: event.created ? newDate(event.created) : undefined,
    lastModified: event.updated ? newDate(event.updated) : undefined,
    organizer: event.organizer
      ? {
          name: event.organizer.displayName ?? undefined,
          email: event.organizer.email ?? undefined,
        }
      : undefined,
    attendees: event.attendees?.map((attendee) => ({
      name: attendee.displayName ?? undefined,
      email: attendee.email ?? "",
      status: attendee.responseStatus ?? undefined,
    })),
  };
}

function isExpiredSyncToken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: number | string;
    response?: { status?: number };
  };
  return Number(candidate.code ?? candidate.response?.status) === 410;
}

export async function syncGoogleCalendar(
  feed: GoogleSyncFeed,
  options?: { forceFullSync?: boolean }
) {
  if (!feed.url || !feed.accountId || !feed.userId) {
    throw new Error("Google feed is missing calendar, account, or user data.");
  }

  const forceFullSync = options?.forceFullSync ?? false;
  const useIncrementalSync = Boolean(feed.syncToken && !forceFullSync);
  const calendar = await getGoogleCalendarClient(feed.accountId, feed.userId);

  try {
    const currentYear = newDate().getFullYear();
    const params: calendar_v3.Params$Resource$Events$List = useIncrementalSync
      ? {
          calendarId: feed.url,
          syncToken: feed.syncToken ?? undefined,
          showDeleted: true,
          singleEvents: true,
        }
      : {
          calendarId: feed.url,
          timeMin: newDateFromYMD(currentYear, 0, 1).toISOString(),
          timeMax: newDateFromYMD(currentYear + 1, 0, 1).toISOString(),
          showDeleted: false,
          singleEvents: true,
          orderBy: "startTime",
        };

    const { events, nextSyncToken } = await fetchEventPages(calendar, params);
    const deletedExternalIds = events
      .filter((event) => event.status === "cancelled")
      .map((event) => event.id)
      .filter((id): id is string => Boolean(id));
    const activeEvents = events.filter((event) => event.status !== "cancelled");
    const recurringRules = await getRecurringRules(
      calendar,
      feed.url,
      activeEvents
    );
    const records = activeEvents
      .map((event) => toCalendarEvent(event, recurringRules))
      .filter((event): event is CalendarEventSyncInput => event !== null);

    await persistGoogleCalendarEvents({
      feedId: feed.id,
      events: records,
      deletedExternalIds,
      replaceAll: !useIncrementalSync,
    });
    await updateCalendarFeedSyncState(feed.id, {
      lastSync: newDate(),
      syncToken: nextSyncToken ?? feed.syncToken,
      error: null,
    });

    await logger.info(
      "Google calendar sync completed",
      {
        feedId: feed.id,
        incremental: useIncrementalSync,
        processed: records.length,
        deleted: deletedExternalIds.length,
      },
      LOG_SOURCE
    );

    return {
      processedEventIds: new Set(records.map((event) => event.externalEventId)),
      nextSyncToken,
    };
  } catch (error) {
    if (useIncrementalSync && isExpiredSyncToken(error)) {
      await logger.info(
        "Google sync token expired; retrying full sync",
        { feedId: feed.id },
        LOG_SOURCE
      );
      await updateCalendarFeedSyncState(feed.id, { syncToken: null });
      return syncGoogleCalendar(
        { ...feed, syncToken: null },
        { forceFullSync: true }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    await updateCalendarFeedSyncState(feed.id, { error: message });
    await logger.error(
      "Google calendar sync failed",
      { feedId: feed.id, error: message },
      LOG_SOURCE
    );
    throw error;
  }
}
