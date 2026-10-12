import { CalendarEvent, ConnectedAccount, Prisma } from "@prisma/client";
import ICAL from "ical.js";
import { DAVDepth, DAVResponse, createDAVClient } from "tsdav";

import { APP_NAME } from "@/lib/app-config";
import { openConnectedAccountTokens } from "@/lib/connected-account-secrets";
import { newDate, newDateFromYMD } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { CalendarEventWithFeed } from "@/types/calendar";

import { convertVEventToCalendarEvent } from "./caldav-helpers";
import {
  CalDAVCalendarObject,
  CalendarEventInput,
  CalendarQueryParams,
  ExtendedDAVClient,
  SyncResult,
} from "./caldav-interfaces";
import {
  buildVTimezoneComponent,
  isValidTimeZone,
  zonedTime,
} from "./caldav-vtimezone";

const LOG_SOURCE = "CalDAVCalendar";

/**
 * `syncStatus` of an event the sync archived because the server no longer
 * returned it. Unlike an event the person deleted (archived with any other
 * status), it is restored when a later sync finds it again.
 */
export const CALDAV_REMOVED_UPSTREAM = "REMOVED_UPSTREAM";

/** A local deletion the sync must not undo. */
export function isTombstone(
  existing: { archivedAt: Date | null; syncStatus?: string | null } | null
): boolean {
  return (
    !!existing?.archivedAt && existing.syncStatus !== CALDAV_REMOVED_UPSTREAM
  );
}

type CalDAVEvent = CalendarEvent & {
  excludedInstanceStarts?: Date[];
};

/**
 * Build a RECURRENCE-ID / EXDATE property that points at a single instance of a
 * recurring master, using the SAME value type as the master's DTSTART so the
 * CalDAV server can pair the exception with the correct instance.
 *
 * - Timed master (DATE-TIME DTSTART): emit a UTC date-time (`...Z`) so the
 *   reference is an unambiguous absolute instant regardless of the client's
 *   timezone (GitHub issue #135).
 * - All-day master (`VALUE=DATE` DTSTART): emit a floating `VALUE=DATE` value so
 *   it matches the master's date-typed instances (GitHub issue #100). A UTC
 *   date-time here would not match an all-day instance and the single-instance
 *   update/delete would silently fail.
 *
 * @param name "recurrence-id" or "exdate"
 * @param masterVevent the parsed master VEVENT (used to read DTSTART's type)
 * @param instanceStart the instance's start instant
 */
function buildInstanceReference(
  name: "recurrence-id" | "exdate",
  masterVevent: ICAL.Component,
  instanceStart: Date
): ICAL.Property {
  const masterDtstart = masterVevent.getFirstProperty("dtstart");
  const masterStartValue = masterDtstart?.getFirstValue() as
    | ICAL.Time
    | undefined;
  const masterIsAllDay = masterStartValue?.isDate === true;
  const masterTzid = masterDtstart?.getParameter("tzid") as string | undefined;

  const property = new ICAL.Property(name);

  // Let the ICAL.Time value's own type drive the VALUE parameter: a date-typed
  // value serializes as `VALUE=DATE` automatically, and a date-time value omits
  // VALUE (DATE-TIME is the default). Calling setParameter("value", ...) on top
  // of a typed value emits an invalid duplicate `VALUE=date;VALUE=DATE` that
  // strict servers reject (see GitHub issue #100), so we deliberately do not.
  if (masterIsAllDay) {
    // Match the master's floating DATE value (no time, no Z).
    const dateString = instanceStart.toISOString().split("T")[0];
    property.setValue(ICAL.Time.fromDateString(dateString));
  } else if (masterTzid && isValidTimeZone(masterTzid)) {
    // Master DTSTART is TZID-qualified with a resolvable IANA zone: emit the
    // exception with the SAME TZID and the instance's wall-clock in that zone,
    // so servers that key exceptions by the DTSTART value form pair it with the
    // right instance (GitHub issue #135). A server-supplied custom/non-IANA
    // TZID is not usable here, so we fall through to an unambiguous UTC value
    // rather than throwing (which, in the delete path, would leave the master
    // un-updated after the remote DELETE already fired).
    property.setValue(zonedTime(instanceStart, masterTzid));
    property.setParameter("tzid", masterTzid);
  } else {
    // Timed master without a TZID (UTC `Z` form): match with a UTC date-time.
    property.setValue(ICAL.Time.fromJSDate(instanceStart, true));
  }

  return property;
}

function localInstanceExternalEventId(
  masterExternalEventId: string,
  start: Date
) {
  return `${masterExternalEventId}__${start.toISOString()}`;
}

function occurrenceReferenceStart(
  masterExternalEventId: string,
  externalEventId: string | null | undefined,
  fallback: Date
): Date {
  const prefix = `${masterExternalEventId}__`;
  if (!externalEventId?.startsWith(prefix)) return fallback;

  const referenceStart = new Date(externalEventId.slice(prefix.length));
  return Number.isNaN(referenceStart.getTime()) ? fallback : referenceStart;
}

/**
 * Service for interacting with CalDAV servers
 */
export class CalDAVCalendarService {
  private client: ExtendedDAVClient | null = null;
  private account: ConnectedAccount;

  /**
   * Creates a new CalDAV calendar service
   * @param account Connected account with CalDAV credentials
   */
  constructor(account: ConnectedAccount) {
    // The stored password is encrypted; decrypt once here so every request
    // below authenticates with the plaintext. Client is created when needed.
    this.account = openConnectedAccountTokens(account);
  }

  /**
   * Creates and initializes the CalDAV client
   * @returns Initialized DAVClient
   */
  private async getClient(): Promise<ExtendedDAVClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.account.caldavUrl) {
      throw new Error("CalDAV URL is required");
    }

    try {
      // Use type assertion to tell TypeScript this is our extended client type
      this.client = (await createDAVClient({
        serverUrl: this.account.caldavUrl,
        credentials: {
          username: this.account.caldavUsername || this.account.email,
          password: this.account.accessToken,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      })) as unknown as ExtendedDAVClient;

      return this.client;
    } catch (error) {
      logger.error(
        "Failed to create CalDAV client",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          accountId: this.account.id,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  private async expandRecurringEvents(
    masterEvents: CalendarEvent[]
  ): Promise<CalendarEvent[]> {
    const instances: CalendarEvent[] = [];
    for (const masterEvent of masterEvents) {
      if (masterEvent.isRecurring) {
        const instanceEvents = await this.expandMasterEvent(masterEvent);
        instances.push(...instanceEvents);
      }
    }
    return instances;
  }

  private async expandMasterEvent(
    masterEvent: CalendarEvent
  ): Promise<CalendarEvent[]> {
    //todo expand master event locally and return all instances
    if (!masterEvent.isRecurring || !masterEvent.recurrenceRule) {
      return [];
    }

    try {
      // Import RRule from the rrule library
      const { RRule } = await import("rrule");

      // Define the time range for expansion (1 year back to 1 year ahead)
      const timeRange = this.getTimeRange();

      // Parse the recurrence rule
      const options = RRule.parseString(masterEvent.recurrenceRule);

      // Set the start date from the master event
      options.dtstart = masterEvent.start;

      // Create the RRule instance
      const rule = new RRule(options);

      // Get all occurrences between the start and end dates
      const excludedStarts = new Set(
        ((masterEvent as CalDAVEvent).excludedInstanceStarts ?? []).map(
          (date) => date.toISOString()
        )
      );
      const occurrences = rule
        .between(timeRange.start, timeRange.end, true)
        .filter((date) => !excludedStarts.has(date.toISOString()));

      // Create instance events for each occurrence
      const instanceEvents: CalendarEvent[] = occurrences
        .map((date) => {
          // Calculate the duration of the master event
          const duration =
            masterEvent.end.getTime() - masterEvent.start.getTime();

          // Create a new end date for this instance
          const endDate = new Date(date.getTime() + duration);

          // Create the instance event
          return {
            ...masterEvent,
            externalEventId: masterEvent.externalEventId
              ? localInstanceExternalEventId(masterEvent.externalEventId, date)
              : null,
            start: date,
            end: endDate,
            isRecurring: false,
            recurrenceRule: null,
            isMaster: false,
            recurringEventId: masterEvent.externalEventId,
          };
        })
        .filter(Boolean) as CalendarEvent[];

      return instanceEvents;
    } catch (error) {
      logger.error(
        "Failed to expand master event",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          eventId: masterEvent.id,
          title: masterEvent.title,
          recurrenceRule: masterEvent.recurrenceRule,
        },
        LOG_SOURCE
      );
      return [];
    }
  }

  /**
   * Fetches events from a CalDAV calendar for a specific time range
   * @param start Start date
   * @param end End date
   * @param calendarPath Path to the calendar
   * @returns Array of calendar events
   */
  private async getEvents(
    start: Date,
    end: Date,
    calendarPath: string
  ): Promise<CalendarEvent[]> {
    try {
      const client = await this.getClient();
      if (!client) return [];

      // Fetch master events (without expand)
      const masterEvents = await this.fetchMasterEvents(
        client,
        start,
        end,
        calendarPath
      );

      const instanceEvents = await this.expandRecurringEvents(masterEvents);

      // A CalDAV resource can contain explicit RECURRENCE-ID exceptions as
      // well as a master RRULE. Keep an exception authoritative over the
      // locally expanded occurrence at the same instant.
      const explicitInstanceKeys = new Set(
        masterEvents
          .filter((event) => !event.isMaster && event.externalEventId)
          .map((event) => event.externalEventId as string)
      );

      const allEvents = [
        ...masterEvents,
        ...instanceEvents.filter(
          (event) =>
            !event.externalEventId ||
            !explicitInstanceKeys.has(event.externalEventId)
        ),
      ];
      return allEvents;
    } catch (error) {
      logger.error(
        "Failed to fetch CalDAV events",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          accountId: this.account.id,
          calendarPath,
        },
        LOG_SOURCE
      );
      // Rethrown, never an empty list: the sync archives every event missing
      // from the result, so a failed fetch read as "no events" emptied the
      // whole calendar.
      throw error;
    }
  }

  /**
   * Format a date for CalDAV requests (YYYYMMDDTHHMMSSZ)
   * @param date Date to format
   * @returns Formatted date string
   */
  private formatDateForCalDAV(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  }

  /**
   * Fetch master events from the CalDAV server
   * @param client CalDAV client
   * @param start Start date
   * @param end End date
   * @param calendarPath Path to the calendar
   * @returns Array of master events
   */
  private async fetchMasterEvents(
    client: ExtendedDAVClient,
    start: Date,
    end: Date,
    calendarPath: string
  ): Promise<CalendarEvent[]> {
    // Create query parameters for master events
    const queryParams = this.createCalDAVQueryParams(
      calendarPath,
      start,
      end,
      false // Don't use expand for master events
    );

    // Fetch calendar objects
    const calendarObjects = await client.calendarQuery(queryParams);

    // Process the calendar objects to extract master events
    return await this.processCalendarObjects(calendarObjects);
  }

  /**
   * Create CalDAV query parameters
   * @param calendarPath Path to the calendar
   * @param start Start date
   * @param end End date
   * @param useExpand Whether to use the expand parameter
   * @returns CalDAV query parameters
   */
  private createCalDAVQueryParams(
    calendarPath: string,
    start: Date,
    end: Date,
    useExpand: boolean
  ): CalendarQueryParams {
    const props: Record<string, unknown> = {
      "calendar-data": useExpand
        ? {
            expand: {
              _attributes: {
                start: this.formatDateForCalDAV(start),
                end: this.formatDateForCalDAV(end),
              },
            },
          }
        : {}, // No expand for master events
    };

    return {
      url: calendarPath,
      props,
      filters: {
        "comp-filter": {
          _attributes: {
            name: "VCALENDAR",
          },
          "comp-filter": {
            _attributes: {
              name: "VEVENT",
            },
            "time-range": {
              _attributes: {
                start: this.formatDateForCalDAV(start),
                end: this.formatDateForCalDAV(end),
              },
            },
          },
        },
      },
      depth: "1" as DAVDepth,
    };
  }

  /**
   * Process calendar objects returned by the CalDAV server
   * @param calendarObjects Calendar objects returned by the server
   * @param mode Whether to prioritize master events or instance events
   * @returns Array of calendar events
   */
  private async processCalendarObjects(
    calendarObjects: DAVResponse[]
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    // Track UIDs to avoid duplicates
    const processedUids = new Set<string>();

    // Convert DAVResponse objects to CalDAVCalendarObject format
    const calendarData = this.extractCalendarData(calendarObjects);

    for (const obj of calendarData) {
      try {
        // Extract iCalendar data
        const icalData = this.extractICalData(obj);
        if (!icalData) continue;

        // Parse the iCalendar data
        const vevents = this.parseICalData(icalData, obj.url);
        if (!vevents || vevents.length === 0) continue;

        // Process each VEVENT component
        for (const vevent of vevents) {
          // Extract event properties
          const { uid, hasRRule, hasRecurrenceId, recurrenceIdStart } =
            this.extractEventProperties(vevent);

          // Convert VEVENT to CalendarEvent
          const event = convertVEventToCalendarEvent(vevent);
          const excludedInstanceStarts = vevent
            .getAllProperties("exdate")
            .flatMap((property) => property.getValues())
            .flatMap((value) => {
              if (
                typeof value === "object" &&
                value !== null &&
                "toJSDate" in value &&
                typeof value.toJSDate === "function"
              ) {
                return [value.toJSDate()];
              }
              return [];
            });
          if (excludedInstanceStarts.length > 0) {
            (event as CalDAVEvent).excludedInstanceStarts =
              excludedInstanceStarts;
          }

          // Set event properties based on its type
          this.setEventTypeProperties(
            event,
            uid,
            hasRRule,
            hasRecurrenceId,
            recurrenceIdStart,
            processedUids
          );
          events.push(event);
        }
      } catch (error) {
        logger.error(
          "Failed to process calendar object",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            url: obj.url || "unknown",
          },
          LOG_SOURCE
        );
      }
    }

    return events;
  }

  /**
   * Extract calendar data from DAVResponse objects
   * @param calendarObjects Calendar objects returned by the server
   * @returns Array of calendar objects
   */
  private extractCalendarData(
    calendarObjects: DAVResponse[]
  ): CalDAVCalendarObject[] {
    return calendarObjects.map((obj: DAVResponse) => {
      // Get calendar data, which might be in different formats
      const calendarDataProp =
        obj.props?.["calendar-data"] || obj.props?.calendarData || "";

      return {
        url: obj.href || "",
        etag: obj.props?.getetag || "",
        data: calendarDataProp,
      };
    });
  }

  /**
   * Extract iCalendar data from a calendar object
   * @param obj Calendar object
   * @returns iCalendar data as string, or empty string if extraction fails
   */
  private extractICalData(obj: CalDAVCalendarObject): string {
    let icalData = "";
    if (typeof obj.data === "string") {
      icalData = obj.data;
    } else if (typeof obj.data === "object" && obj.data !== null) {
      // Try to get _cdata property if it exists
      const dataObj = obj.data as Record<string, unknown>;
      if ("_cdata" in dataObj && typeof dataObj._cdata === "string") {
        icalData = dataObj._cdata;
      } else {
        // Try to stringify the object as a fallback
        try {
          icalData = JSON.stringify(obj.data);
        } catch (error) {
          logger.warn(
            "Failed to stringify calendar data",
            {
              url: obj.url,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            LOG_SOURCE
          );
          return ""; // Return empty string to indicate failure
        }
      }
    }

    if (!icalData) {
      logger.warn(
        "Empty iCalendar data",
        { url: obj.url || "unknown" },
        LOG_SOURCE
      );
    }

    return icalData;
  }

  /**
   * Parse iCalendar data and extract VEVENT components
   * @param icalData iCalendar data as string
   * @param url URL of the calendar object (for logging)
   * @returns Array of VEVENT components
   */
  private parseICalData(
    icalData: string,
    url: string
  ): ICAL.Component[] | null {
    try {
      const jcalData = ICAL.parse(icalData);
      const vcalendar = new ICAL.Component(jcalData);
      const vevents = vcalendar.getAllSubcomponents("vevent");
      return vevents;
    } catch (error) {
      logger.error(
        "Failed to parse iCalendar data",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          url,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Synchronizes a CalDAV calendar with the local database
   * @param calendarPath Path to the calendar
   * @returns Sync result with added, updated, and deleted events
   */
  async syncCalendar(
    feedId: string,
    calendarPath: string,
    userId: string
  ): Promise<SyncResult> {
    try {
      // Get the calendar feed from the database
      const feed = await prisma.calendarFeed.findFirst({
        where: {
          url: calendarPath,
          accountId: this.account.id,
          type: "CALDAV",
          userId,
        },
      });

      if (!feed) {
        throw new Error(`Calendar feed not found for path: ${calendarPath}`);
      }
      // Get existing events for this feed
      // const existingEvents = await this.getExistingEvents(feed.id);

      // Define time range for events (1 year back to 1 year ahead)
      const timeRange = this.getTimeRange();

      // Fetch events from CalDAV server
      const events = await this.getEvents(
        timeRange.start,
        timeRange.end,
        calendarPath
      );

      const externalEventIds = events.flatMap((event) =>
        event.externalEventId ? [event.externalEventId] : []
      );
      await prisma.calendarEvent.updateMany({
        where: {
          feedId: feed.id,
          archivedAt: null,
          externalEventId:
            externalEventIds.length > 0
              ? { notIn: externalEventIds }
              : { not: null },
        },
        // Marked as gone upstream (not deleted by the person), so it comes
        // back if a later sync finds it again.
        data: { archivedAt: newDate(), syncStatus: CALDAV_REMOVED_UPSTREAM },
      });

      // Process events and update database
      // const result = await this.processEvents(events, existingEvents, feed.id);

      const result = await this.createAllEvents(events, feed.id);
      // Update the feed's last sync time and sync token
      await prisma.calendarFeed.update({
        where: { id: feed.id, userId },
        data: {
          lastSync: newDate(),
          syncToken: feed.syncToken ? String(feed.syncToken) : null,
        },
      });

      return result;
    } catch (error) {
      logger.error(
        "Failed to sync CalDAV calendar",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          calendarPath,
          accountId: this.account.id,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Updates an existing event in a CalDAV calendar
   * @param calendarPath Path to the calendar
   * @param externalEventId ID of the event to update
   * @param event Updated event data
   * @returns Updated calendar event
   */
  async updateEvent(
    eventWithFeed: CalendarEventWithFeed,
    calendarPath: string,
    externalEventId: string,
    event: CalendarEventInput,
    mode: "single" | "series",
    userId: string
  ): Promise<CalendarEvent> {
    try {
      if (mode === "single") {
        if (!eventWithFeed.masterEventId) {
          throw new Error(
            "A recurring instance is required for a single update"
          );
        }
        return await this.updateSingleOccurrence(
          eventWithFeed,
          calendarPath,
          event,
          userId
        );
      }

      // Get the CalDAV client
      const client = await this.getClient();

      // For Fastmail compatibility, we'll use a PUT request to a specific URL
      // Ensure the calendar path doesn't have a trailing slash
      const normalizedCalendarPath = calendarPath.endsWith("/")
        ? calendarPath.slice(0, -1)
        : calendarPath;

      // Create a URL for the event using the externalEventId
      const eventUrl = `${normalizedCalendarPath}/${externalEventId}.ics`;

      // Resolve the user's timezone so timed events serialize with a TZID
      // (keeps wall-clock time across DST for recurring events; issue #135).
      const timeZone =
        event.timeZone ?? (await this.resolveUserTimeZone(userId));

      // Generate the iCalendar data
      const icalData = this.convertToICalendar({
        ...event,
        id: externalEventId,
        timeZone,
      });

      let response;
      try {
        // Try using PUT method first (works better with some CalDAV servers like Fastmail)
        response = await fetch(eventUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            Authorization:
              "Basic " +
              Buffer.from(
                `${this.account.caldavUsername || this.account.email}:${
                  this.account.accessToken
                }`
              ).toString("base64"),
          },
          body: icalData,
        });

        // Check if the response indicates success (2xx status code)
        if (response.status < 200 || response.status >= 300) {
          logger.error(
            "Server returned error status when updating event with PUT",
            {
              status: response.status,
              statusText: response.statusText,
              calendarPath,
              eventId: externalEventId,
              eventUrl,
              mode,
            },
            LOG_SOURCE
          );

          // If PUT fails, fall back to the updateObject method
          response = await client.updateObject({
            url: eventUrl,
            data: icalData,
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
            },
          });

          // Check if the fallback method also failed
          if (response.status < 200 || response.status >= 300) {
            logger.error(
              "Server returned error status when updating event with fallback method",
              {
                status: response.status,
                statusText: response.statusText,
                calendarPath,
                eventId: externalEventId,
                mode,
              },
              LOG_SOURCE
            );
            throw new Error(
              `Failed to update event on server: ${
                response.statusText || response.status
              }`
            );
          }
        }
      } catch (updateError) {
        logger.error(
          "Failed to update event on CalDAV server",
          {
            error:
              updateError instanceof Error
                ? updateError.message
                : "Unknown error",
            stack:
              updateError instanceof Error && updateError.stack
                ? updateError.stack
                : null,
            calendarPath,
            eventUrl,
            mode,
          },
          LOG_SOURCE
        );
        throw updateError;
      }

      // Sync the calendar to get the updated event
      const syncResult = await this.syncCalendar(
        eventWithFeed.feedId,
        calendarPath,
        userId
      );

      // Find the updated event in the sync results
      const updatedEvent = syncResult.added.find(
        (e) => e.externalEventId === externalEventId
      );

      if (!updatedEvent) {
        throw new Error("Updated event not found in sync results");
      }

      return updatedEvent;
    } catch (error) {
      logger.error(
        "Failed to update CalDAV event",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          calendarPath,
          eventId: externalEventId,
          eventTitle: event.title,
          mode,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Updates one occurrence by adding or replacing a RECURRENCE-ID exception in
   * the master resource. Locally expanded occurrences are projections of that
   * master, not separately addressable CalDAV resources.
   */
  private async updateSingleOccurrence(
    eventWithFeed: CalendarEventWithFeed,
    calendarPath: string,
    event: CalendarEventInput,
    userId: string
  ): Promise<CalendarEvent> {
    const masterEvent = await prisma.calendarEvent.findFirst({
      where: {
        id: eventWithFeed.masterEventId!,
        feedId: eventWithFeed.feedId,
        isMaster: true,
      },
    });

    if (!masterEvent?.externalEventId) {
      throw new Error("Recurring master event not found");
    }

    const normalizedCalendarPath = calendarPath.endsWith("/")
      ? calendarPath.slice(0, -1)
      : calendarPath;
    const masterEventUrl = `${normalizedCalendarPath}/${masterEvent.externalEventId}.ics`;
    const authorization =
      "Basic " +
      Buffer.from(
        `${this.account.caldavUsername || this.account.email}:${
          this.account.accessToken
        }`
      ).toString("base64");
    const masterResponse = await fetch(masterEventUrl, {
      headers: { Authorization: authorization },
    });

    if (!masterResponse.ok) {
      throw new Error(
        `Failed to retrieve recurring master event: ${
          masterResponse.statusText || masterResponse.status
        }`
      );
    }

    const vcalendar = new ICAL.Component(
      ICAL.parse(await masterResponse.text())
    );
    const masterVevent = vcalendar
      .getAllSubcomponents("vevent")
      .find((vevent) => !vevent.hasProperty("recurrence-id"));
    if (!masterVevent) {
      throw new Error("Recurring master VEVENT not found");
    }

    const occurrenceStart = occurrenceReferenceStart(
      masterEvent.externalEventId ?? null,
      eventWithFeed.externalEventId,
      eventWithFeed.start
    );
    const instanceExternalEventId =
      eventWithFeed.externalEventId ??
      localInstanceExternalEventId(
        masterEvent.externalEventId,
        occurrenceStart
      );

    const timeZone = event.timeZone ?? (await this.resolveUserTimeZone(userId));
    const exceptionCalendar = new ICAL.Component(
      ICAL.parse(
        this.convertToICalendar({
          ...event,
          id: masterEvent.externalEventId,
          isRecurring: false,
          recurrenceRule: undefined,
          timeZone,
        })
      )
    );
    const exceptionVevent = exceptionCalendar.getFirstSubcomponent("vevent");
    if (!exceptionVevent) {
      throw new Error("Failed to create recurring event exception");
    }

    exceptionVevent.updatePropertyWithValue("uid", masterEvent.externalEventId);
    exceptionVevent.removeAllProperties("rrule");
    exceptionVevent.removeAllProperties("recurrence-id");
    const recurrenceId = buildInstanceReference(
      "recurrence-id",
      masterVevent,
      occurrenceStart
    );
    exceptionVevent.addProperty(recurrenceId);

    const recurrenceIdValue = (
      recurrenceId.getFirstValue() as ICAL.Time
    ).toString();
    const recurrenceIdTzid = recurrenceId.getParameter("tzid");
    for (const existingException of vcalendar.getAllSubcomponents("vevent")) {
      const existingRecurrenceId =
        existingException.getFirstProperty("recurrence-id");
      if (
        existingRecurrenceId &&
        (existingRecurrenceId.getFirstValue() as ICAL.Time).toString() ===
          recurrenceIdValue &&
        existingRecurrenceId.getParameter("tzid") === recurrenceIdTzid
      ) {
        vcalendar.removeSubcomponent(existingException);
      }
    }
    vcalendar.addSubcomponent(exceptionVevent);

    const updateResponse = await fetch(masterEventUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        Authorization: authorization,
      },
      body: vcalendar.toString(),
    });
    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update recurring instance: ${
          updateResponse.statusText || updateResponse.status
        }`
      );
    }

    const syncResult = await this.syncCalendar(
      eventWithFeed.feedId,
      calendarPath,
      userId
    );
    const updatedEvent = syncResult.added.find(
      (candidate) => candidate.externalEventId === instanceExternalEventId
    );
    if (!updatedEvent) {
      throw new Error("Updated recurring instance not found after sync");
    }

    return updatedEvent;
  }

  /**
   * Deletes an event from a CalDAV calendar
   * @param calendarPath Path to the calendar
   * @param eventId ID of the event to delete
   * @param mode Whether to delete a single instance or the entire series
   */
  async deleteEvent(
    event: CalendarEventWithFeed,
    calendarPath: string,
    externalEventId: string,
    mode: "single" | "series",
    userId: string
  ): Promise<void> {
    try {
      if (mode === "single") {
        if (!event.masterEventId) {
          throw new Error(
            "A recurring instance is required for a single delete"
          );
        }
        await this.deleteSingleOccurrence(event, calendarPath, userId);
        return;
      }

      // Get the CalDAV client
      const client = await this.getClient();

      // For Fastmail compatibility, we'll use a DELETE request to a specific URL
      // Ensure the calendar path doesn't have a trailing slash
      const normalizedCalendarPath = calendarPath.endsWith("/")
        ? calendarPath.slice(0, -1)
        : calendarPath;

      // Create a URL for the event using the externalEventId
      const eventUrl = `${normalizedCalendarPath}/${externalEventId}.ics`;

      let response;
      try {
        // Try using DELETE method first (works better with some CalDAV servers like Fastmail)
        response = await fetch(eventUrl, {
          method: "DELETE",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(
                `${this.account.caldavUsername || this.account.email}:${
                  this.account.accessToken
                }`
              ).toString("base64"),
          },
        });

        // Check if the response indicates success (2xx status code)
        if (response.status < 200 || response.status >= 300) {
          logger.error(
            "Server returned error status when deleting event with DELETE",
            {
              status: response.status,
              statusText: response.statusText,
              calendarPath,
              eventId: externalEventId,
              eventUrl,
              mode,
            },
            LOG_SOURCE
          );

          // If DELETE fails, fall back to the deleteObject method
          response = await client.deleteObject({
            url: eventUrl,
          });

          // Check if the fallback method also failed
          if (response.status < 200 || response.status >= 300) {
            logger.error(
              "Server returned error status when deleting event with fallback method",
              {
                status: response.status,
                statusText: response.statusText,
                calendarPath,
                eventId: externalEventId,
                mode,
              },
              LOG_SOURCE
            );
            throw new Error(
              `Failed to delete event on server: ${
                response.statusText || response.status
              }`
            );
          }
        }
      } catch (deleteError) {
        logger.error(
          "Failed to delete event on CalDAV server",
          {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : "Unknown error",
            stack:
              deleteError instanceof Error && deleteError.stack
                ? deleteError.stack
                : null,
            calendarPath,
            eventUrl,
            mode,
          },
          LOG_SOURCE
        );
        throw deleteError;
      }

      // Sync the calendar to update our local database
      await this.syncCalendar(event.feedId, calendarPath, userId);
    } catch (error) {
      logger.error(
        "Failed to delete CalDAV event",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          calendarPath,
          eventId: externalEventId,
          mode,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Deletes one occurrence by excluding it from the master resource. Any prior
   * explicit override for that occurrence is removed as well, so it cannot win
   * over the EXDATE during a subsequent sync.
   */
  private async deleteSingleOccurrence(
    event: CalendarEventWithFeed,
    calendarPath: string,
    userId: string
  ): Promise<void> {
    const masterEvent = await prisma.calendarEvent.findFirst({
      where: {
        id: event.masterEventId!,
        feedId: event.feedId,
        isMaster: true,
      },
    });
    if (!masterEvent?.externalEventId) {
      throw new Error("Recurring master event not found");
    }

    const normalizedCalendarPath = calendarPath.endsWith("/")
      ? calendarPath.slice(0, -1)
      : calendarPath;
    const masterEventUrl = `${normalizedCalendarPath}/${masterEvent.externalEventId}.ics`;
    const authorization =
      "Basic " +
      Buffer.from(
        `${this.account.caldavUsername || this.account.email}:${
          this.account.accessToken
        }`
      ).toString("base64");
    const masterResponse = await fetch(masterEventUrl, {
      headers: { Authorization: authorization },
    });
    if (!masterResponse.ok) {
      throw new Error(
        `Failed to retrieve recurring master event: ${
          masterResponse.statusText || masterResponse.status
        }`
      );
    }

    const vcalendar = new ICAL.Component(
      ICAL.parse(await masterResponse.text())
    );
    const masterVevent = vcalendar
      .getAllSubcomponents("vevent")
      .find((vevent) => !vevent.hasProperty("recurrence-id"));
    if (!masterVevent) {
      throw new Error("Recurring master VEVENT not found");
    }

    const occurrenceStart = occurrenceReferenceStart(
      masterEvent.externalEventId ?? null,
      event.externalEventId,
      event.start
    );
    const exdate = buildInstanceReference(
      "exdate",
      masterVevent,
      occurrenceStart
    );
    masterVevent.addProperty(exdate);
    const recurrenceId = buildInstanceReference(
      "recurrence-id",
      masterVevent,
      occurrenceStart
    );
    const recurrenceIdValue = (
      recurrenceId.getFirstValue() as ICAL.Time
    ).toString();
    const recurrenceIdTzid = recurrenceId.getParameter("tzid");
    for (const existingException of vcalendar.getAllSubcomponents("vevent")) {
      const existingRecurrenceId =
        existingException.getFirstProperty("recurrence-id");
      if (
        existingRecurrenceId &&
        (existingRecurrenceId.getFirstValue() as ICAL.Time).toString() ===
          recurrenceIdValue &&
        existingRecurrenceId.getParameter("tzid") === recurrenceIdTzid
      ) {
        vcalendar.removeSubcomponent(existingException);
      }
    }

    const updateResponse = await fetch(masterEventUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        Authorization: authorization,
      },
      body: vcalendar.toString(),
    });
    if (!updateResponse.ok) {
      throw new Error(
        `Failed to delete recurring instance: ${
          updateResponse.statusText || updateResponse.status
        }`
      );
    }

    await this.syncCalendar(event.feedId, calendarPath, userId);
  }

  /**
   * Looks up the user's IANA timezone from their settings, used to serialize
   * timed events with a `TZID` so recurring events keep wall-clock time across
   * DST (GitHub issue #135). Returns undefined when no setting exists, in which
   * case serialization falls back to UTC.
   */
  private async resolveUserTimeZone(
    userId: string
  ): Promise<string | undefined> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { timeZone: true },
      });
      return settings?.timeZone || undefined;
    } catch (error) {
      logger.warn(
        "Failed to load user timezone for CalDAV serialization; using UTC",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          userId,
        },
        LOG_SOURCE
      );
      return undefined;
    }
  }

  /**
   * Converts an internal event to iCalendar format
   * @param event Calendar event to convert
   * @returns iCalendar data as string
   */
  private convertToICalendar(event: CalendarEventInput): string {
    // Create a new iCalendar component
    const calendar = new ICAL.Component(["vcalendar", [], []]);
    calendar.updatePropertyWithValue("prodid", `-//${APP_NAME}//EN`);
    calendar.updatePropertyWithValue("version", "2.0");

    // Create the event component
    const vevent = new ICAL.Component(["vevent", [], []]);
    vevent.updatePropertyWithValue("uid", event.id || crypto.randomUUID());
    vevent.updatePropertyWithValue("summary", event.title);

    if (event.description) {
      vevent.updatePropertyWithValue("description", event.description);
    }

    if (event.location) {
      vevent.updatePropertyWithValue("location", event.location);
    }

    // Add start and end times
    const dtstart = new ICAL.Property("dtstart");
    const dtend = new ICAL.Property("dtend");

    if (event.allDay) {
      // Use ICAL.Time for all-day events with isDate=true. The date-typed value
      // makes ical.js emit `VALUE=DATE` exactly once; also calling
      // setParameter("value", "date") produced an invalid
      // `VALUE=date;VALUE=DATE` that strict CalDAV servers (Baikal, Nextcloud)
      // reject with an auth/error response (see GitHub issue #100).
      const formatDate = (date: Date) => {
        const dateString = date.toISOString().split("T")[0];
        return ICAL.Time.fromDateString(dateString);
      };

      dtstart.setValue(formatDate(event.start));

      // For all-day events, the end date should be the next day in iCal
      // Make sure we create a new date to avoid mutating the original
      const endDate = new Date(event.end);
      dtend.setValue(formatDate(endDate));
    } else {
      // Serialize timed events with an explicit timezone so other CalDAV
      // clients interpret them at the correct instant AND so recurring events
      // keep their wall-clock time across DST transitions (a fixed-UTC DTSTART +
      // RRULE would drift by an hour after a DST change). See GitHub issue #135.
      //
      // When a user timezone is available we emit `DTSTART;TZID=<zone>` plus a
      // matching VTIMEZONE; otherwise we fall back to UTC (`...Z`), which is
      // still unambiguous for single (non-recurring) events.
      const vtimezone = event.timeZone
        ? buildVTimezoneComponent(event.timeZone)
        : null;

      if (vtimezone && event.timeZone) {
        calendar.addSubcomponent(vtimezone);
        dtstart.setValue(zonedTime(event.start, event.timeZone));
        dtend.setValue(zonedTime(event.end, event.timeZone));
        dtstart.setParameter("tzid", event.timeZone);
        dtend.setParameter("tzid", event.timeZone);
      } else {
        // Floating local time (no `Z`, no `TZID`) would be re-interpreted in
        // each client's own timezone and shift the event; emit UTC instead.
        dtstart.setValue(ICAL.Time.fromJSDate(event.start, true));
        dtend.setValue(ICAL.Time.fromJSDate(event.end, true));
      }
    }

    vevent.addProperty(dtstart);
    vevent.addProperty(dtend);

    // Handle recurring events
    if (event.isRecurring && event.recurrenceRule) {
      // Convert from RRule string format (e.g., "FREQ=DAILY;INTERVAL=1") to iCalendar format
      // The iCalendar format expects just the rule part without the property name
      const rruleValue = event.recurrenceRule;

      // Create a proper RRULE property
      const rruleProp = new ICAL.Property("rrule");

      // Parse the RRule string into an object
      const rruleObj: Record<string, string | number | string[]> = {};
      rruleValue.split(";").forEach((part) => {
        const [key, value] = part.split("=");
        if (key && value) {
          // Handle array values like BYDAY=MO,TU,WE
          if (value.includes(",")) {
            rruleObj[key.toLowerCase()] = value.split(",");
          } else if (!isNaN(Number(value))) {
            // Handle numeric values
            rruleObj[key.toLowerCase()] = Number(value);
          } else {
            // Handle string values
            rruleObj[key.toLowerCase()] = value;
          }
        }
      });

      // Set the value as a jCal-compatible object
      rruleProp.setValue(rruleObj);

      // Add the property to the event
      vevent.addProperty(rruleProp);
    }

    // Add the event to the calendar
    calendar.addSubcomponent(vevent);

    // Return the iCalendar string
    return calendar.toString();
  }

  /**
   * Creates a new event in a CalDAV calendar
   * @param calendarPath Path to the calendar
   * @param event Event data to create
   * @returns Created calendar event
   */
  async createEvent(
    calendarPath: string,
    event: CalendarEventInput,
    userId: string
  ): Promise<CalendarEvent> {
    try {
      // Generate a unique ID for the event if not provided
      const eventId = event.id || crypto.randomUUID();

      // Resolve the user's timezone so timed events serialize with a TZID
      // (keeps wall-clock time across DST for recurring events; issue #135).
      const timeZone =
        event.timeZone ?? (await this.resolveUserTimeZone(userId));

      // Generate the iCalendar data
      const icalData = this.convertToICalendar({
        ...event,
        id: eventId,
        timeZone,
      });

      // Get the CalDAV client
      const client = await this.getClient();

      // For Fastmail compatibility, we'll use a PUT request to a specific URL
      // Ensure the calendar path doesn't have a trailing slash
      const normalizedCalendarPath = calendarPath.endsWith("/")
        ? calendarPath.slice(0, -1)
        : calendarPath;

      // Create a URL for the event using the UID
      const eventUrl = `${normalizedCalendarPath}/${eventId}.ics`;

      let response;
      try {
        // Try using PUT method first (works better with some CalDAV servers like Fastmail)
        response = await fetch(eventUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "If-None-Match": "*", // Ensures we're creating a new resource
            Authorization:
              "Basic " +
              Buffer.from(
                `${this.account.caldavUsername || this.account.email}:${
                  this.account.accessToken
                }`
              ).toString("base64"),
          },
          body: icalData,
        });

        // Check if the response indicates success (2xx status code)
        if (response.status < 200 || response.status >= 300) {
          logger.error(
            "Server returned error status when creating event with PUT",
            {
              status: response.status,
              statusText: response.statusText,
              calendarPath,
              eventId,
              eventUrl,
            },
            LOG_SOURCE
          );

          // If PUT fails, fall back to the createObject method
          response = await client.createObject({
            url: calendarPath,
            data: icalData,
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "If-None-Match": "*", // Ensures we're creating a new resource
            },
          });

          // Check if the fallback method also failed
          if (response.status < 200 || response.status >= 300) {
            logger.error(
              "Server returned error status when creating event with fallback method",
              {
                status: response.status,
                statusText: response.statusText,
                calendarPath,
                eventId,
              },
              LOG_SOURCE
            );
            throw new Error(
              `Failed to create event on server: ${
                response.statusText || response.status
              }`
            );
          }
        }
      } catch (createError) {
        logger.error(
          "Failed to create event on CalDAV server",
          {
            error:
              createError instanceof Error
                ? createError.message
                : "Unknown error",
            stack:
              createError instanceof Error && createError.stack
                ? createError.stack
                : null,
            calendarPath,
            eventUrl,
          },
          LOG_SOURCE
        );
        throw createError;
      }

      // Get the calendar feed from the database
      const feed = await prisma.calendarFeed.findFirst({
        where: {
          url: calendarPath,
          accountId: this.account.id,
          type: "CALDAV",
          userId,
        },
      });

      if (!feed) {
        throw new Error(`Calendar feed not found for path: ${calendarPath}`);
      }

      // Sync the calendar to get the newly created event
      const syncResult = await this.syncCalendar(feed.id, calendarPath, userId);

      // Find the newly created event in the sync results
      const createdEvent = syncResult.added.find(
        (e) => e.externalEventId === eventId
      );

      if (!createdEvent) {
        throw new Error("Newly created event not found in sync results");
      }

      return createdEvent;
    } catch (error) {
      logger.error(
        "Failed to create CalDAV event",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          calendarPath,
          eventTitle: event.title,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Define time range for events (1 year back to 1 year ahead)
   * @returns Object with start and end dates
   */
  private getTimeRange(): { start: Date; end: Date } {
    const now = newDate();
    return {
      start: newDateFromYMD(now.getFullYear() - 1, 0, 1), // 1 year ago, January 1st
      end: newDateFromYMD(now.getFullYear() + 1, 11, 31), // End of next year
    };
  }

  private async createAllEvents(
    events: CalendarEvent[],
    feedId: string
  ): Promise<SyncResult> {
    try {
      // Separate master events and instances
      const masterEvents = events.filter((e) => e.isMaster);
      const instanceEvents = events.filter((e) => !e.isMaster);

      // Create master events first
      const createdMasterEvents = await this.createMasterEvents(
        masterEvents,
        feedId
      );

      // Create a map of external IDs to database IDs for linking instances
      const masterEventMap = new Map<string, string>();
      for (const event of createdMasterEvents) {
        if (event.externalEventId) {
          masterEventMap.set(event.externalEventId, event.id);
        }
      }

      // Create instance events with proper links to master events
      const createdInstanceEvents = await this.createInstanceEvents(
        instanceEvents,
        masterEventMap,
        feedId
      );

      return {
        added: [...createdMasterEvents, ...createdInstanceEvents],
        updated: [],
        deleted: [],
      };
    } catch (error) {
      logger.error(
        "Failed to create CalDAV events",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          feedId,
        },
        LOG_SOURCE
      );
      return { added: [], updated: [], deleted: [] };
    }
  }

  private async createMasterEvents(
    masterEvents: CalendarEvent[],
    feedId: string
  ): Promise<CalendarEvent[]> {
    const createdEvents: CalendarEvent[] = [];

    // Process events in batches to avoid potential issues with large datasets
    for (const event of masterEvents) {
      try {
        const existing = event.externalEventId
          ? await prisma.calendarEvent.findFirst({
              where: {
                feedId,
                externalEventId: event.externalEventId,
              },
            })
          : null;
        if (isTombstone(existing)) continue;

        // Prepare event data for database
        const eventData = {
          feedId,
          externalEventId: event.externalEventId,
          title: event.title || "Untitled Event",
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          isRecurring: event.isRecurring || false,
          recurrenceRule: event.recurrenceRule,
          allDay: event.allDay || false,
          status: event.status,
          isMaster: true,
          masterEventId: null,
          recurringEventId: null,
          // Use Prisma.JsonNull for JSON fields
          organizer: Prisma.JsonNull,
          attendees: Prisma.JsonNull,
        };

        // Create the event (an event that was gone upstream comes back)
        const createdEvent = existing
          ? await prisma.calendarEvent.update({
              where: { id: existing.id },
              data: existing.archivedAt
                ? { ...eventData, archivedAt: null, syncStatus: null }
                : eventData,
            })
          : await prisma.calendarEvent.create({ data: eventData });

        createdEvents.push(createdEvent);
      } catch (error) {
        logger.error(
          "Failed to create master event",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            eventId: event.id,
            title: event.title,
          },
          LOG_SOURCE
        );
      }
    }

    return createdEvents;
  }

  private async createInstanceEvents(
    instanceEvents: CalendarEvent[],
    masterEventMap: Map<string, string>,
    feedId: string
  ): Promise<CalendarEvent[]> {
    const createdEvents: CalendarEvent[] = [];

    // Process events in batches to avoid potential issues with large datasets
    for (const event of instanceEvents) {
      try {
        const existing = event.externalEventId
          ? await prisma.calendarEvent.findFirst({
              where: {
                feedId,
                externalEventId: event.externalEventId,
              },
            })
          : null;
        if (isTombstone(existing)) continue;

        // Find the master event ID for this instance
        let masterEventId = null;
        if (
          event.recurringEventId &&
          masterEventMap.has(event.recurringEventId)
        ) {
          masterEventId = masterEventMap.get(event.recurringEventId) || null;
        }

        // Prepare event data for database
        const eventData = {
          feedId,
          externalEventId: event.externalEventId,
          title: event.title || "Untitled Event",
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          isRecurring: event.isRecurring || false,
          recurrenceRule: event.recurrenceRule,
          allDay: event.allDay || false,
          status: event.status,
          isMaster: false,
          masterEventId,
          recurringEventId: event.recurringEventId,
          // Use Prisma.JsonNull for JSON fields
          organizer: Prisma.JsonNull,
          attendees: Prisma.JsonNull,
        };

        // Create the event (an event that was gone upstream comes back)
        const createdEvent = existing
          ? await prisma.calendarEvent.update({
              where: { id: existing.id },
              data: existing.archivedAt
                ? { ...eventData, archivedAt: null, syncStatus: null }
                : eventData,
            })
          : await prisma.calendarEvent.create({ data: eventData });

        createdEvents.push(createdEvent);
      } catch (error) {
        logger.error(
          "Failed to create instance event",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            eventId: event.id,
            title: event.title,
            recurringEventId: event.recurringEventId,
          },
          LOG_SOURCE
        );
      }
    }

    return createdEvents;
  }

  /**
   * Extract key properties from a VEVENT component
   * @param vevent VEVENT component
   * @returns Object with extracted properties
   */
  private extractEventProperties(vevent: ICAL.Component): {
    uid: string;
    hasRRule: boolean;
    hasRecurrenceId: boolean;
    recurrenceIdStart?: Date;
    summary: string | null;
  } {
    const hasRRule = vevent.hasProperty("rrule");
    const hasRecurrenceId = vevent.hasProperty("recurrence-id");
    const recurrenceIdValue = vevent.getFirstPropertyValue(
      "recurrence-id"
    ) as ICAL.Time | null;
    const recurrenceIdStart = recurrenceIdValue?.toJSDate();
    const uidValue = vevent.getFirstPropertyValue("uid");
    const uid = uidValue ? String(uidValue) : crypto.randomUUID();
    const summary = vevent.getFirstPropertyValue("summary");

    return {
      uid,
      hasRRule,
      hasRecurrenceId,
      recurrenceIdStart,
      summary: summary ? String(summary) : null,
    };
  }

  /**
   * Set event properties based on its type (master, instance, or standalone)
   * @param event The event to update
   * @param uid The event's UID
   * @param hasRRule Whether the event has a recurrence rule
   * @param hasRecurrenceId Whether the event has a recurrence ID
   * @param processedUids Set of already processed UIDs
   */
  private setEventTypeProperties(
    event: CalendarEvent,
    uid: string,
    hasRRule: boolean,
    hasRecurrenceId: boolean,
    recurrenceIdStart: Date | undefined,
    processedUids: Set<string>
  ): void {
    // Set event properties based on its type
    if (hasRRule && !hasRecurrenceId) {
      // Master event
      event.isMaster = true;
      event.isRecurring = true;
      event.masterEventId = null;
      event.externalEventId = uid;
      processedUids.add(uid);
    } else if (hasRecurrenceId) {
      // Instance event
      event.isMaster = false;
      event.isRecurring = false;
      // For instance events, we need to link to the master event
      // The master event's UID is the base part of the instance's UID (before any _date suffix)
      const masterUid = uid;
      event.masterEventId = masterUid;
      event.recurringEventId = masterUid;
      event.externalEventId = localInstanceExternalEventId(
        masterUid,
        recurrenceIdStart ?? event.start
      );
      processedUids.add(event.externalEventId);
    } else {
      // Standalone event
      event.isMaster = false;
      event.isRecurring = false;
      event.masterEventId = null;
      event.externalEventId = uid;
      processedUids.add(uid);
    }
  }
}
