import { NextRequest, NextResponse } from "next/server";

import {
  STATS_DAYS,
  type StatsRange,
  buildStats,
} from "@/services/stats/home-stats";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDayWindow,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "StatsAPI";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/stats?range=week|month (default week)
 *
 * What the person closed over the last 7 or 30 days, ending on their today
 * (their saved time zone): per day, per project, per weekday, the best day and
 * weekday, and the minutes of Focus when any session was stored. Scoped to the
 * signed-in user and workspace; nothing from other members leaks in.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const asked = request.nextUrl.searchParams.get("range") ?? "week";
  if (asked !== "week" && asked !== "month") {
    return NextResponse.json(
      { error: "range must be week or month" },
      { status: 400 }
    );
  }
  const range: StatsRange = asked;

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: auth.userId },
      select: { timeZone: true },
    });
    const timeZone = normalizeUserTimeZone(settings?.timeZone);
    const days = habitDayWindow(newDate(), timeZone, STATS_DAYS[range]);
    // a day edge in the person's zone can sit a day either side of UTC's
    const since = new Date(
      habitDateFromKey(days[0] as string).getTime() - DAY_MS
    );
    const until = new Date(
      habitDateFromKey(days[days.length - 1] as string).getTime() + 2 * DAY_MS
    );

    const [tasks, sessions] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...workspaceDataScopeWhere(auth.workspace, auth.userId),
          status: "completed",
          trashedAt: null,
          completedAt: { gte: since, lt: until },
        },
        select: { completedAt: true, projectId: true },
      }),
      prisma.focusSession.findMany({
        where: {
          userId: auth.userId,
          phase: "FOCUS",
          endedAt: { not: null },
          startedAt: { gte: since, lt: until },
        },
        select: { startedAt: true, elapsedMinutes: true },
      }),
    ]);

    const ids = [
      ...new Set(tasks.flatMap((t) => (t.projectId ? [t.projectId] : []))),
    ];
    const projects = ids.length
      ? await prisma.project.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, color: true },
        })
      : [];

    return NextResponse.json(
      buildStats({ range, days, timeZone, tasks, sessions, projects }),
      { headers: NO_STORE }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to build stats",
      LOG_SOURCE,
      "Could not load your stats."
    );
  }
}
