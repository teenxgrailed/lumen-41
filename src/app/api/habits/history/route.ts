import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDateKey,
  habitDayWindow,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "HabitHistoryAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;
const DEFAULT_DAYS = 124; // the Habits screen's "Last four months"
const MAX_DAYS = 400;

/**
 * Each active habit's checkins over the last `days` days (default 124),
 * oldest first, ending on the person's today, as 1 / 0 per day: the same
 * strip `/api/needt/today` sends for fourteen days, longer. It exists for the
 * Habits screen's "Last four months" dots; nothing else reads it.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days =
    Number.isInteger(asked) && asked > 0
      ? Math.min(asked, MAX_DAYS)
      : DEFAULT_DAYS;

  const now = newDate();
  const settings = await prisma.userSettings.findUnique({
    where: { userId: auth.userId },
    select: { timeZone: true },
  });
  const window = habitDayWindow(now, settings?.timeZone, days);
  const rows = await prisma.habit.findMany({
    where: {
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      userId: auth.userId,
      archivedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      completions: {
        where: { date: { gte: habitDateFromKey(window[0]) } },
        select: { date: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    {
      now: now.toISOString(),
      // The day the strips end on, in the zone the server wrote them in.
      today: window[window.length - 1],
      days,
      habits: rows.map((row) => {
        const kept = new Set(row.completions.map((c) => habitDateKey(c.date)));
        return { id: row.id, done: window.map((d) => (kept.has(d) ? 1 : 0)) };
      }),
    },
    { headers: NO_STORE }
  );
}
