import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  afterOpen,
  currentOrder,
  isNavId,
  pendingFrom,
  pinnedFrom,
  rankedPlaces,
  usageFrom,
} from "@/lib/needt3/nav-rank";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "nav-usage";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * How the menu and the sidebar are arranged: the order in use, the ranked
 * list both surfaces draw, the pins, a pending order and the last 14 days of
 * opens. The same data sits in `prefs` (`GET /api/user-settings`); pins are
 * written there too (`navPinned`).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  const row = await prisma.userSettings.findUnique({
    where: { userId: auth.userId },
    select: { prefs: true },
  });
  const prefs = row?.prefs ?? {};
  return NextResponse.json(
    {
      order: currentOrder(prefs),
      ranked: rankedPlaces(prefs),
      pinned: pinnedFrom(prefs),
      pending: pendingFrom(prefs),
      usage: usageFrom(prefs),
    },
    { headers: NO_STORE }
  );
}

/**
 * One open of a place: `{ place }`. Counts it for today (UTC), keeps 14 days,
 * and once a week ranks the order into `navOrderPending`, which the app
 * applies on its next fresh load.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    place?: unknown;
  } | null;
  const place = body?.place;
  if (!isNavId(place))
    return NextResponse.json({ error: "Unknown place" }, { status: 400 });
  const userId = auth.userId;
  try {
    const patch = await prisma.$transaction(async (tx) => {
      // The row is locked so two opens in a row both count.
      const rows = await tx.$queryRaw<{ prefs: unknown }[]>`
        SELECT "prefs" FROM "UserSettings" WHERE "userId" = ${userId} FOR UPDATE`;
      if (!rows.length) return null;
      const next = afterOpen(rows[0].prefs, place, newDate());
      const put = JSON.stringify(next);
      await tx.$executeRaw`
        UPDATE "UserSettings"
        SET "prefs" = COALESCE("prefs", '{}'::jsonb) || ${put}::jsonb
        WHERE "userId" = ${userId}`;
      return next;
    });
    return NextResponse.json(
      { counted: !!patch, pending: !!patch?.navOrderPending },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error(
      "Failed to count a place open",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to count the open" },
      { status: 500 }
    );
  }
}
