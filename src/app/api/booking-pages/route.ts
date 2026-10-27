import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { canCreateBookingPage } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "booking-pages-route";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const [pages, user] = await Promise.all([
    prisma.bookingPage.findMany({
      where: { userId: auth.userId },
      include: {
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { emailVerified: true },
    }),
  ]);
  return NextResponse.json({
    pages,
    emailVerified: Boolean(user?.emailVerified),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const owner = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { emailVerified: true },
  });
  if (!owner?.emailVerified) {
    return NextResponse.json(
      {
        error: "Confirm your email to publish",
        code: "EMAIL_VERIFICATION_REQUIRED",
      },
      { status: 403 }
    );
  }
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    title?: unknown;
    slug?: unknown;
    description?: unknown;
    durationMinutes?: unknown;
    timeZone?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug =
    typeof body.slug === "string"
      ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
      : "";
  if (!title || !slug || slug.length < 3) {
    return NextResponse.json(
      { error: "Title and a valid slug are required" },
      { status: 400 }
    );
  }
  const entitlement = await canCreateBookingPage(auth.userId);
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: "UPGRADE_REQUIRED", entitlement },
      { status: 403 }
    );
  }

  const workSchedule = await prisma.workSchedule.findFirst({
    where: { userId: auth.userId },
    include: { windows: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const availability = workSchedule?.windows.reduce<
    Record<string, Array<{ start: string; end: string }>>
  >((days, window) => {
    const key = String(window.dayOfWeek);
    (days[key] ??= []).push({
      start: window.startTime,
      end: window.endTime,
    });
    return days;
  }, {}) ?? {
    "1": [{ start: "09:00", end: "17:00" }],
    "2": [{ start: "09:00", end: "17:00" }],
    "3": [{ start: "09:00", end: "17:00" }],
    "4": [{ start: "09:00", end: "17:00" }],
    "5": [{ start: "09:00", end: "17:00" }],
  };
  try {
    const page = await prisma.bookingPage.create({
      data: {
        userId: auth.userId,
        title,
        slug,
        description:
          typeof body.description === "string"
            ? body.description.trim() || null
            : null,
        durationMinutes:
          typeof body.durationMinutes === "number" &&
          Number.isInteger(body.durationMinutes) &&
          body.durationMinutes >= 15 &&
          body.durationMinutes <= 480
            ? body.durationMinutes
            : 30,
        timeZone:
          typeof body.timeZone === "string"
            ? body.timeZone
            : workSchedule?.timeZone ?? "UTC",
        availability,
      },
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "This booking URL is already taken" },
      { status: 409 }
    );
  }
}
