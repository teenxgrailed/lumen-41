import { NextRequest, NextResponse } from "next/server";

import { deliverPush } from "@/services/reminders/reminder-delivery";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

const LOG_SOURCE = "push-subscriptions-test-route";

/**
 * Sends one test notification to the signed-in user's own device(s). With an
 * `endpoint` in the body only that device is used (the one the person is
 * holding); without it every saved device of the account gets it.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  if (!getVapidConfiguration().configured) {
    return NextResponse.json(
      { error: "Push delivery is not configured on this server" },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: unknown;
  };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: auth.userId, ...(endpoint ? { endpoint } : {}) },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "This device is not subscribed yet" },
      { status: 404 }
    );
  }

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      deliverPush(subscription, {
        title: "Needt",
        body: "Notifications work on this device.",
        url: "/today",
      })
    )
  );
  const sent = results.filter(
    (result) => result.status === "fulfilled" && result.value
  ).length;
  const failed = results.filter((result) => result.status === "rejected");
  for (const result of failed) {
    await logger.error(
      "Test push failed",
      {
        userId: auth.userId,
        error:
          result.status === "rejected" && result.reason instanceof Error
            ? result.reason.message
            : "unknown",
      },
      LOG_SOURCE
    );
  }
  if (sent === 0) {
    // Either the push service said the subscription is gone (it was removed)
    // or it refused the message.
    return NextResponse.json(
      {
        error:
          failed.length > 0
            ? "The push service refused the message"
            : "This device's subscription had expired and was removed",
        sent,
      },
      { status: failed.length > 0 ? 502 : 410 }
    );
  }
  return NextResponse.json({ sent });
}
