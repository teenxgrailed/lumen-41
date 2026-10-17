import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

const LOG_SOURCE = "AccountSyncAPI";

/**
 * "Sync now" for one calendar account: queues the worker's calendar sync for
 * every enabled calendar the account has (the same job a provider webhook
 * queues) and answers `{ queued }`. The route does not wait for the sync.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const account = await prisma.connectedAccount.findFirst({
      where: { id, userId: auth.userId },
      select: {
        id: true,
        calendars: { where: { enabled: true }, select: { id: true } },
      },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const jobs = await Promise.all(
      account.calendars.map((feed) => enqueueCalendarSync(feed.id))
    );
    const queued = jobs.filter(Boolean).length;
    if (account.calendars.length > 0 && queued === 0) {
      return NextResponse.json(
        { error: "Calendar sync is not configured." },
        { status: 503 }
      );
    }
    return NextResponse.json({ queued });
  } catch (error) {
    await logger.error(
      "Failed to enqueue calendar sync",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not start calendar sync." },
      { status: 500 }
    );
  }
}
