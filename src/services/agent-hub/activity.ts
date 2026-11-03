import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { WorkspaceKey } from "./context";
import { historyWindow } from "./limits";
import type { ActivityInput } from "./schemas";

/**
 * The activity feed: hub events across all items, newest first. A read model
 * over HubItemEvent; nothing here writes. The window is the plan's history
 * (7 days Free, 90 Pro). Plumbing events (heartbeats, links, unblocked,
 * lease expiry) are left out: the feed is what happened to the work.
 */

export const ACTIVITY_KINDS = [
  "created",
  "claimed",
  "updated",
  "completed",
  "escalated",
  "answered",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_PAGE = 50;

/** Stored event types behind each feed kind. */
const TYPES: Record<ActivityKind, string[]> = {
  created: ["created"],
  claimed: ["claimed"],
  updated: ["update", "status"],
  completed: ["completed", "failed"],
  escalated: ["escalated"],
  answered: ["owner_answer"],
};

function kindOf(type: string): ActivityKind | null {
  for (const kind of ACTIVITY_KINDS) {
    if (TYPES[kind].includes(type)) return kind;
  }
  return null;
}

export async function listActivity(key: WorkspaceKey, input: ActivityInput) {
  const window = await historyWindow(key.userId);
  const limit = Math.min(input.limit ?? ACTIVITY_PAGE, ACTIVITY_PAGE);
  const kinds = input.kinds?.length ? input.kinds : [...ACTIVITY_KINDS];

  const where: Prisma.HubItemEventWhereInput = {
    at: { gte: window.since },
    type: { in: kinds.flatMap((kind) => TYPES[kind]) },
    item: { userId: key.userId, workspaceId: key.workspaceId },
  };
  if (input.agent) {
    const agents = await prisma.hubAgent.findMany({
      where: {
        userId: key.userId,
        workspaceId: key.workspaceId,
        OR: [{ id: input.agent }, { name: input.agent }],
      },
      select: { id: true },
    });
    where.actorAgentId = { in: agents.map((agent) => agent.id) };
  }

  const rows = await prisma.hubItemEvent.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: { item: { select: { id: true, title: true } } },
  });
  const page = rows.slice(0, limit);
  const agentIds = [
    ...new Set(
      page.map((row) => row.actorAgentId).filter((id): id is string => !!id)
    ),
  ];
  const names = new Map<string, string>();
  if (agentIds.length) {
    const agents = await prisma.hubAgent.findMany({
      where: { id: { in: agentIds }, userId: key.userId },
      select: { id: true, name: true },
    });
    for (const agent of agents) names.set(agent.id, agent.name);
  }

  return {
    windowDays: Math.round(
      (Date.now() - window.since.getTime()) / (24 * 60 * 60 * 1000)
    ),
    events: page.flatMap((row) => {
      const kind = kindOf(row.type);
      if (!kind) return [];
      return [
        {
          id: row.id,
          at: row.at.toISOString(),
          kind,
          type: row.type,
          actor:
            row.actorKind === "agent"
              ? {
                  kind: "agent",
                  id: row.actorAgentId,
                  name:
                    (row.actorAgentId && names.get(row.actorAgentId)) ||
                    "agent",
                }
              : { kind: row.actorKind },
          item: { id: row.item.id, title: row.item.title },
          message: row.message,
        },
      ];
    }),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}
