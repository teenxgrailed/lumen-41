import { NextRequest, NextResponse } from "next/server";

import { buildStreak } from "@/services/streak/streak";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDateKey,
  habitDayWindow,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "StreakAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the best run is read. */
const LOOKBACK_DAYS = 365;

/**
 * GET /api/streak
 *
 * { current, best, today, days: [{ date, done }] }. A day counts when the
 * signed-in person closed at least one task or kept one habit on it, in their
 * saved time zone. `days` is the last seven, oldest first, ending on their
 * today; `current` ends today (or yesterday while today is still open).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: auth.userId },
      select: { timeZone: true },
    });
    const timeZone = normalizeUserTimeZone(settings?.timeZone);
    const now = newDate();
    const window = habitDayWindow(now, timeZone, 7);
    const today = window[window.length - 1] as string;
    const first = habitDayWindow(now, timeZone, LOOKBACK_DAYS)[0] as string;
    // a day edge in the person's zone can sit a day either side of UTC's
    const since = new Date(habitDateFromKey(first).getTime() - DAY_MS);

    const [tasks, completions] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...workspaceDataScopeWhere(auth.workspace, auth.userId),
          status: "completed",
          trashedAt: null,
          completedAt: { gte: since },
        },
        select: { completedAt: true },
      }),
      prisma.habitCompletion.findMany({
        where: {
          date: { gte: habitDateFromKey(first) },
          habit: { userId: auth.userId },
        },
        select: { date: true },
      }),
    ]);

    const doneDays = new Set<string>();
    for (const t of tasks) {
      if (t.completedAt)
        doneDays.add(formatInTimeZone(t.completedAt, timeZone, "yyyy-MM-dd"));
    }
    for (const c of completions) doneDays.add(habitDateKey(c.date));

    return NextResponse.json(buildStreak({ today, window, doneDays }), {
      headers: NO_STORE,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to build streak",
      LOG_SOURCE,
      "Could not load your streak."
    );
  }
}
