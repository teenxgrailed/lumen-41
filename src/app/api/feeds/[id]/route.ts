import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { feedUpdateSchema } from "@/lib/calendar-feed-input";
import { disableOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { registerCalendarWebhookBestEffort } from "@/lib/calendar-webhooks/register";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "calendar-feed-route";

// Get a specific feed
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id,
        // Ensure the feed belongs to the current user
        userId,
      },
      include: { events: { where: { archivedAt: null } } },
    });

    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    return NextResponse.json(feed);
  } catch (error) {
    logger.error(
      "Failed to fetch feed:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 500 }
    );
  }
}

// Update a specific feed
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const parsed = feedUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid calendar", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updates = parsed.data;
    const updated = await prisma.calendarFeed.update({
      where: {
        id,
        // Ensure the feed belongs to the current user
        userId,
      },
      data: updates,
    });
    if (updated.type === "OUTLOOK" && updates.enabled === true) {
      await registerCalendarWebhookBestEffort(updated.id, "OUTLOOK");
    } else if (updated.type === "OUTLOOK" && updates.enabled === false) {
      await disableOutlookSubscription(updated.id);
    }
    return NextResponse.json(updated);
  } catch (error) {
    logger.error(
      "Failed to update feed:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update feed" },
      { status: 500 }
    );
  }
}

// Delete a specific feed
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { id } = await params;
    const updated = await prisma.calendarFeed.update({
      where: {
        id,
        userId,
      },
      data: { enabled: false },
    });
    if (updated.type === "OUTLOOK") await disableOutlookSubscription(id);
    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    logger.error(
      "Failed to delete feed:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete feed" },
      { status: 500 }
    );
  }
}
