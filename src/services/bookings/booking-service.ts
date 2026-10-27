import { IdempotencyStatus, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

import { APP_NAME } from "@/lib/app-config";
import {
  addDays,
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getBookingConfirmationTemplate } from "@/lib/email/templates/notifications";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "BookingService";
const SLOT_STEP_MINUTES = 15;

type AvailabilityWindow = { start: string; end: string };
type Availability = Record<string, AvailabilityWindow[]>;

function parseAvailability(value: unknown): Availability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Availability = {};
  for (const [day, windows] of Object.entries(value)) {
    if (!Array.isArray(windows)) continue;
    result[day] = windows.filter((window): window is AvailabilityWindow =>
      Boolean(
        window &&
          typeof window === "object" &&
          "start" in window &&
          "end" in window &&
          typeof window.start === "string" &&
          typeof window.end === "string" &&
          window.start < window.end
      )
    );
  }
  return result;
}

function overlaps(start: Date, end: Date, busyStart: Date, busyEnd: Date) {
  return start < busyEnd && end > busyStart;
}

function zonedDateTime(dateKey: string, time: string, timeZone: string) {
  const normalized = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return fromZonedTime(`${dateKey}T${normalized}`, timeZone);
}

export async function getBookingSlots(
  slug: string,
  options: { from?: Date; days?: number } = {}
) {
  const page = await prisma.bookingPage.findFirst({
    where: {
      slug,
      isActive: true,
      user: { emailVerified: { not: null } },
    },
    select: {
      id: true,
      userId: true,
      durationMinutes: true,
      bufferBefore: true,
      bufferAfter: true,
      minimumNotice: true,
      bookingHorizonDays: true,
      timeZone: true,
      availability: true,
    },
  });
  if (!page) return null;

  const now = new Date();
  const earliest = addMinutes(now, page.minimumNotice);
  const horizon = addDays(now, page.bookingHorizonDays);
  const requestedFrom = options.from ?? now;
  const days = Math.min(Math.max(options.days ?? 14, 1), 31);
  const requestedEnd = addDays(requestedFrom, days);
  const rangeStart = requestedFrom > now ? requestedFrom : now;
  const rangeEnd = requestedEnd < horizon ? requestedEnd : horizon;

  const [calendarEvents, scheduledBlocks, bookings] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        feed: { userId: page.userId, enabled: true },
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
        OR: [{ status: null }, { status: { not: "cancelled" } }],
      },
      select: { start: true, end: true },
    }),
    prisma.scheduledBlock.findMany({
      where: {
        userId: page.userId,
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
      },
      select: { start: true, end: true },
    }),
    prisma.booking.findMany({
      where: {
        ownerId: page.userId,
        status: "CONFIRMED",
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
      },
      select: { start: true, end: true },
    }),
  ]);
  const busy = [...calendarEvents, ...scheduledBlocks, ...bookings];
  const availability = parseAvailability(page.availability);
  const firstDate = newDate(
    `${formatInTimeZone(rangeStart, page.timeZone, "yyyy-MM-dd")}T12:00:00Z`
  );
  const lastDate = newDate(
    `${formatInTimeZone(rangeEnd, page.timeZone, "yyyy-MM-dd")}T12:00:00Z`
  );
  const slots: Array<{ start: string; end: string }> = [];

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const dateKey = formatInTimeZone(date, "UTC", "yyyy-MM-dd");
    const dayOfWeek = String(
      Number(
        formatInTimeZone(
          fromZonedTime(`${dateKey}T12:00:00`, page.timeZone),
          page.timeZone,
          "i"
        )
      ) % 7
    );
    for (const window of availability[dayOfWeek] ?? []) {
      const windowStart = zonedDateTime(dateKey, window.start, page.timeZone);
      const windowEnd = zonedDateTime(dateKey, window.end, page.timeZone);
      for (
        let start = windowStart;
        addMinutes(start, page.durationMinutes) <= windowEnd;
        start = addMinutes(start, SLOT_STEP_MINUTES)
      ) {
        const end = addMinutes(start, page.durationMinutes);
        if (start < earliest || start < rangeStart || end > rangeEnd) continue;
        const bufferedStart = addMinutes(start, -page.bufferBefore);
        const bufferedEnd = addMinutes(end, page.bufferAfter);
        if (
          busy.some((block) =>
            overlaps(bufferedStart, bufferedEnd, block.start, block.end)
          )
        ) {
          continue;
        }
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }

  return { page, slots };
}

export class BookingConflictError extends Error {
  constructor(public readonly code: "SLOT_UNAVAILABLE" | "INVALID_SLOT") {
    super(code);
    this.name = "BookingConflictError";
  }
}

export async function createBooking(input: {
  slug: string;
  idempotencyKey: string;
  guestName: string;
  guestEmail: string;
  start: Date;
  timeZone: string;
}) {
  const page = await prisma.bookingPage.findFirst({
    where: {
      slug: input.slug,
      isActive: true,
      user: { emailVerified: { not: null } },
    },
  });
  if (!page) return null;
  const operation = `CREATE_BOOKING:${page.id}`;
  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      userId_operation_key: {
        userId: page.userId,
        operation,
        key: input.idempotencyKey,
      },
    },
  });
  if (existing?.status === IdempotencyStatus.SUCCEEDED && existing.result) {
    return existing.result;
  }
  if (existing?.status === IdempotencyStatus.IN_PROGRESS) {
    return { commandId: existing.id, status: "IN_PROGRESS" };
  }

  const command = await prisma.idempotencyRecord.upsert({
    where: {
      userId_operation_key: {
        userId: page.userId,
        operation,
        key: input.idempotencyKey,
      },
    },
    update: {
      status: IdempotencyStatus.IN_PROGRESS,
      result: Prisma.JsonNull,
      expiresAt: addMinutes(new Date(), 10),
    },
    create: {
      userId: page.userId,
      operation,
      key: input.idempotencyKey,
      status: IdempotencyStatus.IN_PROGRESS,
      expiresAt: addMinutes(new Date(), 10),
    },
  });

  const end = addMinutes(input.start, page.durationMinutes);
  const validSlots = await getBookingSlots(page.slug, {
    from: addMinutes(input.start, -1),
    days: 1,
  });
  if (
    !validSlots?.slots.some(
      (slot) =>
        slot.start === input.start.toISOString() &&
        slot.end === end.toISOString()
    )
  ) {
    await prisma.idempotencyRecord.update({
      where: { id: command.id },
      data: { status: IdempotencyStatus.FAILED },
    });
    throw new BookingConflictError("INVALID_SLOT");
  }

  const cancelToken = randomBytes(32).toString("base64url");
  const cancelTokenHash = createHash("sha256")
    .update(cancelToken)
    .digest("hex");
  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        const [bookingConflict, eventConflict, blockConflict] =
          await Promise.all([
            tx.booking.findFirst({
              where: {
                ownerId: page.userId,
                status: "CONFIRMED",
                start: { lt: addMinutes(end, page.bufferAfter) },
                end: { gt: addMinutes(input.start, -page.bufferBefore) },
              },
            }),
            tx.calendarEvent.findFirst({
              where: {
                feed: { userId: page.userId, enabled: true },
                start: { lt: addMinutes(end, page.bufferAfter) },
                end: { gt: addMinutes(input.start, -page.bufferBefore) },
                OR: [{ status: null }, { status: { not: "cancelled" } }],
              },
            }),
            tx.scheduledBlock.findFirst({
              where: {
                userId: page.userId,
                start: { lt: addMinutes(end, page.bufferAfter) },
                end: { gt: addMinutes(input.start, -page.bufferBefore) },
              },
            }),
          ]);
        if (bookingConflict || eventConflict || blockConflict) {
          throw new BookingConflictError("SLOT_UNAVAILABLE");
        }

        const feed =
          (await tx.calendarFeed.findFirst({
            where: { userId: page.userId, type: "LOCAL" },
            orderBy: { createdAt: "asc" },
          })) ??
          (await tx.calendarFeed.create({
            data: {
              userId: page.userId,
              name: APP_NAME,
              type: "LOCAL",
              color: "#737373",
              enabled: true,
            },
          }));
        const event = await tx.calendarEvent.create({
          data: {
            feedId: feed.id,
            title: `${page.title} · ${input.guestName}`,
            description: `Booking with ${input.guestEmail}`,
            start: input.start,
            end,
            attendees: [{ name: input.guestName, email: input.guestEmail }],
            status: "confirmed",
          },
        });
        return tx.booking.create({
          data: {
            bookingPageId: page.id,
            ownerId: page.userId,
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            start: input.start,
            end,
            timeZone: input.timeZone,
            calendarEventId: event.id,
            cancelTokenHash,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    const result = {
      commandId: command.id,
      status: "SUCCEEDED",
      bookingId: booking.id,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      cancelToken,
    };
    await prisma.idempotencyRecord.update({
      where: { id: command.id },
      data: { status: IdempotencyStatus.SUCCEEDED, result },
    });
    void EmailService.sendEmail({
      to: input.guestEmail,
      ...getBookingConfirmationTemplate({
        title: page.title,
        startIso: booking.start.toISOString(),
        cancelUrl: `${process.env.NEXTAUTH_URL ?? ""}/book/cancel/${cancelToken}`,
      }),
    }).catch((error) =>
      logger.error("Booking confirmation email failed", { error }, LOG_SOURCE)
    );
    return result;
  } catch (error) {
    await prisma.idempotencyRecord.update({
      where: { id: command.id },
      data: { status: IdempotencyStatus.FAILED },
    });
    if (
      error instanceof BookingConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034")
    ) {
      throw new BookingConflictError("SLOT_UNAVAILABLE");
    }
    throw error;
  }
}

export async function cancelBooking(cancelToken: string) {
  const tokenHash = createHash("sha256").update(cancelToken).digest("hex");
  const booking = await prisma.booking.findUnique({
    where: { cancelTokenHash: tokenHash },
    include: {
      bookingPage: {
        select: { cancellationHours: true },
      },
    },
  });
  if (!booking) return null;
  if (booking.status === "CANCELED") return booking;
  const cutoff = addMinutes(
    booking.start,
    -booking.bookingPage.cancellationHours * 60
  );
  if (new Date() > cutoff) {
    throw new BookingConflictError("INVALID_SLOT");
  }
  return prisma.$transaction(async (tx) => {
    const canceled = await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELED" },
    });
    if (booking.calendarEventId) {
      await tx.calendarEvent.updateMany({
        where: { id: booking.calendarEventId },
        data: { status: "cancelled" },
      });
    }
    return canceled;
  });
}
