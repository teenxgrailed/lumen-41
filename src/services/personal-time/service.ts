import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import {
  type PersonalBlockLike,
  type PersonalOccurrence,
  expandPersonalBlocks,
} from "@/lib/personal-time";
import { prisma } from "@/lib/prisma";

type Client = PrismaClient | Prisma.TransactionClient;

/** The columns every reader needs, so a view never leaks more than this. */
export const personalBlockSelect = {
  id: true,
  userId: true,
  workspaceId: true,
  kind: true,
  title: true,
  emoji: true,
  color: true,
  start: true,
  end: true,
  rrule: true,
  sourceEventId: true,
  isDefault: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PersonalBlockSelect;

export type PersonalBlockRow = Prisma.PersonalBlockGetPayload<{
  select: typeof personalBlockSelect;
}>;

/** Public, JSON-safe view of a block (API, MCP, ops, Ask). */
export function personalBlockView(block: PersonalBlockRow) {
  return {
    id: block.id,
    kind: block.kind,
    title: block.title,
    emoji: block.emoji,
    color: block.color,
    start: block.start.toISOString(),
    end: block.end.toISOString(),
    rrule: block.rrule,
    sourceEventId: block.sourceEventId,
    isDefault: block.isDefault,
    href: `/calendar?personal=${block.id}`,
    updatedAt: block.updatedAt.toISOString(),
  };
}

async function timeZoneOf(client: Client, userId: string) {
  const settings = await client.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return normalizeUserTimeZone(settings?.timeZone);
}

/**
 * Every occurrence of the person's personal time that touches [from, to),
 * repeats and blocks linked to a synced event included. Personal time belongs
 * to the person, so it holds in every workspace the scheduler plans for.
 */
export async function loadPersonalOccurrences(
  userId: string,
  from: Date,
  to: Date,
  client: Client = prisma
): Promise<PersonalOccurrence[]> {
  const blocks = await client.personalBlock.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { rrule: { not: null } },
        { sourceEventId: { not: null } },
        { start: { lt: to }, end: { gt: from } },
      ],
    },
    select: personalBlockSelect,
    orderBy: { start: "asc" },
  });
  if (!blocks.length) return [];

  const linkedIds = blocks.flatMap((b) =>
    b.sourceEventId ? [b.sourceEventId] : []
  );
  const events = linkedIds.length
    ? await client.calendarEvent.findMany({
        where: {
          id: { in: linkedIds },
          archivedAt: null,
          feed: { userId },
        },
        select: { id: true, start: true, end: true },
      })
    : [];
  return expandPersonalBlocks(blocks as PersonalBlockLike[], {
    from,
    to,
    timeZone: await timeZoneOf(client, userId),
    events: new Map(events.map((e) => [e.id, e])),
  });
}

/**
 * The scheduler's view: personal time as busy blocks. A task is never placed
 * inside one, a repeat or a block linked to an event included.
 */
export async function personalBusyBlocks(
  userId: string,
  from: Date,
  to: Date,
  client: Client = prisma
) {
  const occurrences = await loadPersonalOccurrences(userId, from, to, client);
  return occurrences.map((o, index) => ({
    id: `personal:${o.blockId}:${index}`,
    title: o.title,
    start: o.start,
    end: o.end,
    source: "calendar" as const,
  }));
}
