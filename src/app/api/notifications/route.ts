import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "notifications-route";

/**
 * Proactive nudges.
 *
 * `GET` hands over what has not been delivered yet and marks it delivered: the
 * corner's tip reads it, so a nudge is spoken once. `GET ?peek=1` is the bell's
 * read-only feed: the latest nudges whatever their state, nothing marked.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  if (request.nextUrl.searchParams.get("peek") === "1") {
    const notifications = await prisma.proactiveNudge.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ notifications });
  }
  const notifications = await prisma.proactiveNudge.findMany({
    where: { userId: auth.userId, deliveredAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  if (notifications.length > 0) {
    await prisma.proactiveNudge.updateMany({
      where: {
        userId: auth.userId,
        id: { in: notifications.map((notification) => notification.id) },
        deliveredAt: null,
      },
      data: { deliveredAt: new Date() },
    });
  }
  return NextResponse.json({ notifications });
}

/** Marks one nudge (`{ id }`) or every unread one (`{ all: true }`) read. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = (await request.json()) as { id?: unknown; all?: unknown };
  if (body.all === true) {
    await prisma.proactiveNudge.updateMany({
      where: { userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await prisma.proactiveNudge.updateMany({
    where: { id: body.id, userId: auth.userId },
    data: { readAt: new Date() },
  });
  return new NextResponse(null, { status: 204 });
}
