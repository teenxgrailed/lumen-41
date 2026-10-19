import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

const LOG_SOURCE = "push-subscriptions-route";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: auth.userId },
    select: { id: true, endpoint: true, expiresAt: true, createdAt: true },
  });
  // Runtime config: the client asks here instead of relying on a key baked
  // into its bundle at build time.
  const configuration = getVapidConfiguration();
  return NextResponse.json({
    subscriptions,
    configured: configuration.configured,
    publicKey: configuration.configured ? configuration.publicKey : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    typeof body.endpoint !== "string" ||
    !body.endpoint.startsWith("https://") ||
    typeof body.keys?.p256dh !== "string" ||
    typeof body.keys.auth !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid subscription" },
      { status: 400 }
    );
  }
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: body.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== auth.userId) {
    return NextResponse.json(
      { error: "Subscription belongs to another account" },
      { status: 409 }
    );
  }
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      userId: auth.userId,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get("user-agent"),
      expiresAt:
        typeof body.expirationTime === "number"
          ? new Date(body.expirationTime)
          : null,
    },
    create: {
      userId: auth.userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get("user-agent"),
      expiresAt:
        typeof body.expirationTime === "number"
          ? new Date(body.expirationTime)
          : null,
    },
  });
  await logger.info(
    "Push subscription saved",
    { userId: auth.userId, host: new URL(body.endpoint).host },
    LOG_SOURCE
  );
  return NextResponse.json({ id: subscription.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint is required" },
      { status: 400 }
    );
  }
  await prisma.pushSubscription.deleteMany({
    where: { userId: auth.userId, endpoint },
  });
  return new NextResponse(null, { status: 204 });
}
