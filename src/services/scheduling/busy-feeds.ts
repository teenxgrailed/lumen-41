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
