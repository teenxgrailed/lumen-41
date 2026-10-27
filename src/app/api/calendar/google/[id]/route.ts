import { NextRequest, NextResponse } from "next/server";

import { GaxiosError } from "gaxios";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { disableGoogleWatch } from "@/lib/calendar-webhooks/google";
import { registerCalendarWebhookBestEffort } from "@/lib/calendar-webhooks/register";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "GoogleCalendarIdAPI";

interface UpdateRequest {
  enabled?: boolean;
  color?: string;
}

// Update a Google Calendar feed
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
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id,
        userId,
      },
      include: { account: true },
    });

    if (!feed || feed.type !== "GOOGLE" || !feed.url || !feed.accountId) {
      return NextResponse.json(
        { error: "Invalid calendar feed" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const updates = body as UpdateRequest;

    // Update only local properties
    const updatedFeed = await prisma.calendarFeed.update({
      where: { id, userId },
      data: {
        enabled: updates.enabled,
        color: updates.color,
      },
    });
    if (updates.enabled === true) {
      await registerCalendarWebhookBestEffort(id, "GOOGLE");
    } else if (updates.enabled === false) {
      await disableGoogleWatch(id);
    }

    return NextResponse.json(updatedFeed);
  } catch (error) {
    await logger.error(
      "Failed to update Google calendar",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update calendar" },
      { status: 500 }
    );
  }
}

// Delete a Google Calendar feed
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
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id,
        userId,
      },
    });

    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    await disableGoogleWatch(id);
    await prisma.calendarFeed.update({
      where: { id, userId },
      data: { enabled: false },
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    await logger.error(
      "Failed to delete Google calendar",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete calendar" },
      { status: 500 }
    );
  }
}
