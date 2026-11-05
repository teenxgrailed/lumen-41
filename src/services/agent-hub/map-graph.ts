import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import type { WorkspaceKey } from "./context";
import type { MapGraph } from "./map-graph-types";

export type { MapGraph };

const DAY = 24 * 60 * 60 * 1000;
/** Days of activity per agent: the sparkline on a card, the Map's weights. */
export const GRAPH_DAYS = 7;
const MAX_THREADS = 60;

/**
 * The compact links and counts the Agents Map draws, for `?graph=1` on the
 * owner's overview: who worked on which day, and which thread hangs on which
 * item. Owner-only by the route; nothing here carries a title or a message
 * body, so it adds no private text to the overview.
 */
export async function mapGraph(
  key: WorkspaceKey,
  now = newDate()
): Promise<MapGraph> {
  const today = Math.floor(now.getTime() / DAY) * DAY;
  const since = newDate(today - (GRAPH_DAYS - 1) * DAY);
  const where = { userId: key.userId, workspaceId: key.workspaceId };
  // Counted in the database per agent and UTC day: one row each, not the
  // events themselves.
  const [days, threads, messagesThisWeek] = await Promise.all([
    // "at" is a UTC timestamp without a zone: the window start goes in as
    // the same, so the server's time zone cannot shift a day.
    prisma.$queryRaw<{ agent: string; day: number; n: number }[]>`
      SELECT e."actorAgentId" AS agent,
        FLOOR(
          EXTRACT(EPOCH FROM (e."at" - (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'))) / 86400
        )::int AS day,
        COUNT(*)::int AS n
      FROM "HubItemEvent" e
      JOIN "HubItem" i ON i."id" = e."itemId"
      WHERE i."userId" = ${key.userId}
        AND i."workspaceId" = ${key.workspaceId}
        AND e."at" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND e."actorAgentId" IS NOT NULL
      GROUP BY 1, 2`,
    prisma.hubThread.findMany({
      where,
      select: { id: true, itemId: true, lastMessageAt: true },
      orderBy: { lastMessageAt: "desc" },
      take: MAX_THREADS,
    }),
    prisma.hubMessage.count({ where: { ...where, createdAt: { gte: since } } }),
  ]);
  const activity: Record<string, number[]> = {};
  for (const { agent, day, n } of days) {
    if (day < 0 || day >= GRAPH_DAYS) continue;
    const row = (activity[agent] ??= Array(GRAPH_DAYS).fill(0));
    row[day] += Number(n);
  }
  return {
    since: since.toISOString(),
    activity,
    threads: threads.map((t) => ({
      id: t.id,
      itemId: t.itemId,
      lastMessageAt: t.lastMessageAt.toISOString(),
    })),
    messagesThisWeek,
  };
}
