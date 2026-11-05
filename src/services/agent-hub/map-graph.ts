import type { MapGraph } from "@/components/needt3/agents/map-scene";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import type { WorkspaceKey } from "./context";

export type { MapGraph };

const DAY = 24 * 60 * 60 * 1000;
/** Days of activity per agent: the sparkline on a card, the Map's weights. */
export const GRAPH_DAYS = 7;
const MAX_EVENTS = 5000;
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
  const [events, threads, messagesThisWeek] = await Promise.all([
    prisma.hubItemEvent.findMany({
      where: { item: where, at: { gte: since }, actorAgentId: { not: null } },
      select: { actorAgentId: true, at: true },
      orderBy: { at: "desc" },
      take: MAX_EVENTS,
    }),
    prisma.hubThread.findMany({
      where,
      select: { id: true, itemId: true, lastMessageAt: true },
      orderBy: { lastMessageAt: "desc" },
      take: MAX_THREADS,
    }),
    prisma.hubMessage.count({ where: { ...where, createdAt: { gte: since } } }),
  ]);
  const activity: Record<string, number[]> = {};
  for (const event of events) {
    if (!event.actorAgentId) continue;
    const day = Math.floor((event.at.getTime() - since.getTime()) / DAY);
    if (day < 0 || day >= GRAPH_DAYS) continue;
    const row = (activity[event.actorAgentId] ??= Array(GRAPH_DAYS).fill(0));
    row[day]++;
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
