import { prisma } from "@/lib/prisma";

export function parseFeedIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Feeds whose events block scheduling: every enabled feed the person owns,
 * minus the ones they switched off. A feed made later (a synced calendar, the
 * Needt local calendar an MCP event creates) counts from its first event, with
 * no settings write needed. LOCAL feeds cannot be switched off.
 */
export async function resolveBusyFeedIds(
  userId: string,
  excludedCalendars?: string | null
): Promise<string[]> {
  const excluded = new Set(parseFeedIdList(excludedCalendars));
  const feeds = await prisma.calendarFeed.findMany({
    where: { userId, enabled: true },
    select: { id: true, type: true },
  });
  return feeds
    .filter((feed) => feed.type === "LOCAL" || !excluded.has(feed.id))
    .map((feed) => feed.id);
}

/**
 * Prisma filter for events that do not take scheduling time: shown as free or
 * transparent upstream, or an invitation the account owner declined.
 */
export const blockingEventWhere = {
  transparent: false,
  selfDeclined: false,
} as const;

/**
 * External ids of the calendar events we pushed for a person's task blocks.
 * The synced copy of such an event is an echo of the task, not a commitment.
 */
export async function pushedBlockExternalIds(
  userId: string
): Promise<Set<string>> {
  const pushed = await prisma.task.findMany({
    where: { userId, blockEventId: { not: null } },
    select: { blockEventId: true },
  });
  return new Set(
    pushed.flatMap((task) => (task.blockEventId ? [task.blockEventId] : []))
  );
}
