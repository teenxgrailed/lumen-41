import { NextRequest, NextResponse } from "next/server";

import {
  BookingConflictError,
  createBooking,
} from "@/services/bookings/booking-service";

import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const limited = await enforceRateLimits(
    [ipRule(request, "booking-submit:ip", 5, 10 * 60)],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: "Idempotency-Key is required" },
      { status: 400 }
    );
  }
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    guestName?: unknown;
    guestEmail?: unknown;
    start?: unknown;
    timeZone?: unknown;
  };
  const guestName =
    typeof body.guestName === "string" ? body.guestName.trim() : "";
  const guestEmail =
    typeof body.guestEmail === "string"
      ? body.guestEmail.trim().toLowerCase()
      : "";
  const start =
    typeof body.start === "string" ? new Date(body.start) : new Date(NaN);
  if (
    !guestName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) ||
    Number.isNaN(start.getTime())
  ) {
    return NextResponse.json({ error: "Invalid booking details" }, { status: 400 });
  }

  try {
    const { slug } = await params;
    const result = await createBooking({
      slug,
      idempotencyKey,
      guestName,
      guestEmail,
      start,
      timeZone: typeof body.timeZone === "string" ? body.timeZone : "UTC",
    });
    if (!result) {
      return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
    }
    const inProgress =
      typeof result === "object" &&
      result !== null &&
      !Array.isArray(result) &&
      "status" in result &&
      result.status === "IN_PROGRESS";
    return NextResponse.json(result, {
      status: inProgress ? 202 : 201,
    });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    throw error;
  }
}
