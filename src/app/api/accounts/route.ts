import { NextRequest, NextResponse } from "next/server";

import { accountNeedsReconnect } from "@/lib/account-reconnect";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "accounts-route";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    // Get accounts filtered by the current user's ID
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId,
      },
      include: {
        calendars: {
          select: {
            id: true,
            name: true,
            enabled: true,
            error: true,
            lastSync: true,
          },
        },
      },
    });

    return NextResponse.json(
      accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        email: account.email,
        // Surface the CalDAV server URL so multiple CalDAV accounts that share a
        // username (now allowed, see #145) are distinguishable in the UI.
        caldavUrl: account.caldavUrl,
        calendars: account.calendars.map(({ id, name }) => ({ id, name })),
        // Every calendar the account syncs failed on its last run: the sign-in
        // was revoked or expired, the one thing a retry cannot fix. A single
        // failing calendar is not enough (that is a calendar problem).
        needsReconnect: accountNeedsReconnect(account.calendars),
        // At least one calendar failed its last sync (the text stays server-side).
        syncFailing: account.calendars.some((c) => c.enabled && c.error),
        lastSync:
          account.calendars
            .map((c) => c.lastSync)
            .filter((d): d is Date => d instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      }))
    );
  } catch (error) {
    logger.error(
      "Failed to list accounts:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list accounts" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { accountId } = await request.json();
    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Check if the account belongs to the current user
    const account = await prisma.connectedAccount.findUnique({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      return NextResponse.json(
        {
          error: "Account not found or you don't have permission to delete it",
        },
        { status: 404 }
      );
    }

    // Keep local calendar history recoverable while revoking credentials.
    await prisma.calendarFeed.updateMany({
      where: {
        accountId,
        userId,
      },
      data: { accountId: null, enabled: false },
    });

    // Then delete the account
    await prisma.connectedAccount.delete({
      where: {
        id: accountId,
        userId,
      },
    });

    return NextResponse.json({ success: true, disconnected: true });
  } catch (error) {
    logger.error(
      "Failed to remove account:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to remove account" },
      { status: 500 }
    );
  }
}
