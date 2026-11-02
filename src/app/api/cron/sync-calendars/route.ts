import { NextRequest, NextResponse } from "next/server";

import { CalDAVCalendarService } from "@/lib/caldav-calendar";
import { requireCronSecret } from "@/lib/cron/auth";
import { prisma } from "@/lib/prisma";

//todo: this CalDAV branch duplicates the worker's caldav-sweep
// (src/worker/caldav-sweep.ts) and has no time budget: it syncs every enabled
// feed in one request. Retire it once the worker sweep is the only path.
export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const feeds = await prisma.calendarFeed.findMany({
    where: { enabled: true },
    include: { account: true },
  });
  const results = [];

  for (const feed of feeds) {
    if (feed.type !== "CALDAV") {
      results.push({
        feedId: feed.id,
        type: feed.type,
        ok: true,
        skipped: "OAuth provider sync remains route-driven in this build.",
      });
      continue;
    }

    try {
      if (!feed.account || !feed.url || !feed.userId) {
        throw new Error("Missing CalDAV account, URL, or user owner.");
      }

      await new CalDAVCalendarService(feed.account).syncCalendar(
        feed.id,
        feed.url,
        feed.userId
      );
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { lastSync: new Date(), error: null },
      });
      results.push({ feedId: feed.id, type: feed.type, ok: true });
    } catch (error) {
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      results.push({
        feedId: feed.id,
        type: feed.type,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
