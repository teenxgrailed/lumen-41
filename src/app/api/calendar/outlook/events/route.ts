import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  deleteCalendarEvent,
  getEvent,
  validateEvent,
} from "@/lib/calendar-db";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  createOutlookEvent,
  deleteOutlookEvent,
  updateOutlookEvent,
} from "@/lib/outlook-calendar";
import { getOutlookClient } from "@/lib/outlook-calendar";
import { syncOutlookCalendar } from "@/lib/outlook-sync";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "OutlookCalendarEventsAPI";

// Create a new event
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { feedId, ...eventData } = body;

    // Check if the feed belongs to the current user
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id: feedId,
        userId,
      },
      include: {
        account: true,
      },
    });

    if (!feed || feed.type !== "OUTLOOK" || !feed.url || !feed.accountId) {
      return NextResponse.json(
        { error: "Invalid calendar feed" },
        { status: 400 }
      );
    }

    // Create event in Outlook Calendar
    const outlookEvent = await createOutlookEvent(
      feed.accountId,
      userId,
      feed.url,
      {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        start: newDate(eventData.start),
        end: newDate(eventData.end),
        allDay: eventData.allDay,
        isRecurring: eventData.isRecurring,
        recurrenceRule: eventData.recurrenceRule,
      }
    );

    if (!outlookEvent.id) {
      throw new Error("Failed to get event ID from Outlook Calendar");
    }

    const pendingEventData = {
      title: eventData.title,
      description: eventData.description ?? null,
      location: eventData.location ?? null,
      start: newDate(eventData.start),
      end: newDate(eventData.end),
      allDay: eventData.allDay ?? false,
      isRecurring: eventData.isRecurring ?? false,
      recurrenceRule: eventData.recurrenceRule ?? null,
      isMaster: eventData.isRecurring ?? false,
      status: "busy",
      syncStatus: "PENDING",
      archivedAt: null,
    };
    const existingEvent = await prisma.calendarEvent.findFirst({
      where: {
        feedId: feed.id,
        externalEventId: outlookEvent.id,
      },
    });

    const pendingEvent = existingEvent
      ? await prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: pendingEventData,
        })
      : await prisma.calendarEvent.create({
          data: {
            ...pendingEventData,
            feedId: feed.id,
            externalEventId: outlookEvent.id,
          },
        });

    try {
      const client = await getOutlookClient(feed.accountId, userId);
      await syncOutlookCalendar(
        client,
        { id: feed.id, url: feed.url },
        feed.syncToken
      );

      const synchronizedEvent = await prisma.calendarEvent.findFirst({
        where: {
          feedId: feed.id,
          externalEventId: outlookEvent.id,
        },
      });
      return NextResponse.json(synchronizedEvent ?? pendingEvent);
    } catch (syncError) {
      logger.warn(
        "Outlook event created locally but refresh sync is pending",
        {
          eventId: pendingEvent.id,
          feedId: feed.id,
          error:
            syncError instanceof Error ? syncError.message : "Unknown error",
        },
        LOG_SOURCE
      );
      return NextResponse.json(pendingEvent, { status: 202 });
    }
  } catch (error) {
    logger.error(
      "Failed to create Outlook calendar event:",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

// Update an event
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { eventId, mode, ...updates } =
      (await request.json().catch(() => null)) ?? {};
    if (!eventId) {
      return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    const event = await getEvent(eventId);

    // Check if the event belongs to a feed owned by the current user
    if (event && event.feed.userId !== userId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const validatedEvent = await validateEvent(event, "OUTLOOK");

    if (validatedEvent instanceof NextResponse) {
      return validatedEvent;
    }

    // Update in Outlook Calendar
    const outlookEvent = await updateOutlookEvent(
      validatedEvent.feed.accountId,
      userId,
      validatedEvent.feed.url,
      validatedEvent.externalEventId,
      {
        ...updates,
        mode,
        start: updates.start ? newDate(updates.start) : undefined,
        end: updates.end ? newDate(updates.end) : undefined,
      }
    );

    if (!outlookEvent.id) {
      throw new Error("Failed to get event ID from Outlook Calendar");
    }

    // Get the updated event and its instances
    const client = await getOutlookClient(
      validatedEvent.feed.accountId,
      userId
    );
    await syncOutlookCalendar(
      client,
      { id: validatedEvent.feed.id, url: validatedEvent.feed.url },
      validatedEvent.feed.syncToken
    );

    const record = await prisma.calendarEvent.findFirst({
      where: {
        externalEventId: outlookEvent.id,
      },
    });
    return NextResponse.json(record);
  } catch (error) {
    logger.error(
      "Failed to update Outlook calendar event:",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

// Delete an event
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { eventId, mode } = (await request.json().catch(() => null)) ?? {};
    if (!eventId) {
      return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    const event = await getEvent(eventId);

    // Check if the event belongs to a feed owned by the current user
    if (event && event.feed.userId !== userId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const validatedEvent = await validateEvent(event, "OUTLOOK");

    if (validatedEvent instanceof NextResponse) {
      return validatedEvent;
    }

    // Delete from Outlook Calendar
    await deleteOutlookEvent(
      validatedEvent.feed.accountId,
      userId,
      validatedEvent.feed.url,
      validatedEvent.externalEventId,
      mode
    );

    // Delete from database using shared function
    await deleteCalendarEvent(validatedEvent.id, mode);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete Outlook calendar event:",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
