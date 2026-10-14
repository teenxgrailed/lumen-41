import { CalendarEvent } from "@prisma/client";

import { APP_NAME } from "@/lib/app-config";
import { newDate } from "@/lib/date-utils";
import { isPlacementBlocked } from "@/lib/flexible-hours-guard-server";
import { prisma } from "@/lib/prisma";

export interface LocalEventInput {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  /** A Needt-local calendar; the person's first local one when omitted. */
  feedId?: string;
}

export type LocalEventResult =
  | { ok: true; event: CalendarEvent }
  | { ok: false; status: number; error: string };

/**
 * Creates an event in one of the person's Needt-local calendars, creating the
 * default local calendar on first use. Provider calendars are refused: an
 * event written only to our copy would vanish on the next sync. Applies the
 * same checks as the calendar API: end after start, and not inside blocked
 * hours.
 */
export async function createLocalEvent(
  userId: string,
  input: LocalEventInput
): Promise<LocalEventResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, status: 400, error: "title is required" };
  const start = newDate(input.start);
  const end = newDate(input.end);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return {
      ok: false,
      status: 400,
      error: "Event end must be after its start",
    };
  }

  let feedId = input.feedId;
  if (!feedId) {
    const feed =
      (await prisma.calendarFeed.findFirst({
        where: { userId, type: "LOCAL" },
        orderBy: { createdAt: "asc" },
      })) ??
      (await prisma.calendarFeed.create({
        data: {
          userId,
          name: APP_NAME,
          type: "LOCAL",
          color: "#6366F1",
          enabled: true,
        },
      }));
    feedId = feed.id;
  }
  const feed = await prisma.calendarFeed.findFirst({
    where: { id: feedId, userId },
    select: { id: true, type: true },
  });
  if (!feed) return { ok: false, status: 404, error: "Calendar not found" };
  if (feed.type !== "LOCAL") {
    return {
      ok: false,
      status: 400,
      error:
        "Events can only be created in a Needt calendar, not a synced provider calendar.",
    };
  }

  const allDay = input.allDay === true;
  if (await isPlacementBlocked(userId, start, end, allDay)) {
    return { ok: false, status: 409, error: "This time is blocked out" };
  }

  const event = await prisma.calendarEvent.create({
    data: {
      feedId,
      title,
      start,
      end,
      description: input.description ?? null,
      location: input.location ?? null,
      allDay,
    },
  });
  return { ok: true, event };
}
