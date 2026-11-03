import { type HubAgent, type HubItem, Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { ACYCLIC_LINK_KINDS, HELD_STATUSES, STALE_AFTER_MS } from "./constants";
import type { WorkspaceKey } from "./context";
import { HubError } from "./errors";

/**
 * Dependencies between items. Only `blocks` changes behaviour: an open item is
 * ready when every item that blocks it is done or cancelled (a failed blocker
 * keeps it waiting; the owner or the creator decides). This module imports
 * only the database and constants so `items.ts` can use it.
 */

type Client = Pick<Prisma.TransactionClient, "hubItemLink">;

/** SQL: the open item (alias "HubItem") has no unfinished blocker. */
export const NOT_BLOCKED_SQL = Prisma.sql`NOT EXISTS (
  SELECT 1 FROM "HubItemLink" l
  JOIN "HubItem" b ON b."id" = l."fromId"
  WHERE l."toId" = "HubItem"."id" AND l."kind" = 'blocks'
    AND b."status" NOT IN ('done', 'cancelled'))`;

/** Prisma filter with the same meaning as NOT_BLOCKED_SQL. */
export const NOT_BLOCKED_WHERE: Prisma.HubItemWhereInput = {
  linksIn: {
    none: {
      kind: "blocks",
      from: { status: { notIn: ["done", "cancelled"] } },
    },
  },
};

export interface Relation {
  kind: string;
  /** out: this item is the `from` side (it blocks / is parent of / ...). */
  direction: "out" | "in";
  item: { id: string; title: string; status: string };
}

export interface ItemDeps {
  relations: Relation[];
  /** Ids of unfinished items that block this one. */
  blockedBy: string[];
}

export const EMPTY_DEPS: ItemDeps = { relations: [], blockedBy: [] };

/** Links and unfinished blockers of the given items, in two queries. */
export async function loadDeps(
  key: WorkspaceKey,
  itemIds: readonly string[]
): Promise<Map<string, ItemDeps>> {
  const out = new Map<string, ItemDeps>();
  if (!itemIds.length) return out;
  const ids = [...new Set(itemIds)];
  const links = await prisma.hubItemLink.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      OR: [{ fromId: { in: ids } }, { toId: { in: ids } }],
    },
    include: {
      from: { select: { id: true, title: true, status: true } },
      to: { select: { id: true, title: true, status: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  const wanted = new Set(ids);
  const get = (id: string) => {
    let deps = out.get(id);
    if (!deps) {
      deps = { relations: [], blockedBy: [] };
      out.set(id, deps);
    }
    return deps;
  };
  for (const link of links) {
    if (wanted.has(link.fromId)) {
      get(link.fromId).relations.push({
        kind: link.kind,
        direction: "out",
        item: link.to,
      });
    }
    if (wanted.has(link.toId)) {
      const deps = get(link.toId);
      deps.relations.push({
        kind: link.kind,
        direction: "in",
        item: link.from,
      });
      if (
        link.kind === "blocks" &&
        !["done", "cancelled"].includes(link.from.status)
      ) {
        deps.blockedBy.push(link.fromId);
      }
    }
  }
  return out;
}

/** Ids of the unfinished items blocking `itemId`. */
export async function openBlockers(
  client: Client,
  itemId: string
): Promise<string[]> {
  const rows = await client.hubItemLink.findMany({
    where: {
      toId: itemId,
      kind: "blocks",
      from: { status: { notIn: ["done", "cancelled"] } },
    },
    select: { fromId: true },
  });
  return rows.map((row) => row.fromId);
}

/** True when following `kind` edges (from → to) from `start` reaches `target`. */
async function reaches(
  client: Client,
  kind: string,
  start: string,
  target: string
): Promise<boolean> {
  const seen = new Set<string>([start]);
  let frontier = [start];
  // Depth is bounded by the number of items; the cap guards a corrupt graph.
  for (let depth = 0; depth < 200 && frontier.length; depth += 1) {
    const rows = await client.hubItemLink.findMany({
      where: { kind, fromId: { in: frontier } },
      select: { toId: true },
    });
    const next: string[] = [];
    for (const row of rows) {
      if (row.toId === target) return true;
      if (!seen.has(row.toId)) {
        seen.add(row.toId);
        next.push(row.toId);
      }
    }
    frontier = next;
  }
  return false;
}

/** Refuses an edge from → to that would close a loop (blocks and parent). */
export async function assertNoCycle(
  client: Client,
  kind: string,
  fromId: string,
  toId: string
) {
  if (fromId === toId) {
    throw new HubError("INVALID", "An item cannot be linked to itself.");
  }
  if (!ACYCLIC_LINK_KINDS.includes(kind)) return;
  if (await reaches(client, kind, toId, fromId)) {
    throw new HubError(
      "CYCLE",
      `This ${kind} link would make a loop: the target already leads back to the source through ${kind} links.`,
      { fromId, toId, kind }
    );
  }
}

/**
 * Called inside the transaction that finished an item (done or cancelled):
 * writes an `unblocked` event on every open dependent whose blockers are now
 * all finished. Events only: a dependent becoming ready is not something the
 * owner has to act on, so there is no push and no unread mark.
 */
export async function noteUnblocked(
  tx: Prisma.TransactionClient,
  finished: { id: string; title: string },
  at: Date
): Promise<string[]> {
  const dependents = await tx.hubItemLink.findMany({
    where: { fromId: finished.id, kind: "blocks", to: { status: "open" } },
    select: { toId: true },
  });
  const readyIds: string[] = [];
  let offset = 0;
  for (const { toId } of dependents) {
    if ((await openBlockers(tx, toId)).length) continue;
    readyIds.push(toId);
    await tx.hubItemEvent.create({
      data: {
        itemId: toId,
        at: newDate(at.getTime() + offset),
        actorKind: "system",
        type: "unblocked",
        fromStatus: "open",
        toStatus: "open",
        message: `Ready to claim: “${finished.title}” is finished.`,
        data: { after: finished.id },
      },
    });
    offset += 1;
  }
  return readyIds;
}

export function isStale(
  item: { status: string; updatedAt: Date },
  now: Date
): boolean {
  return (
    HELD_STATUSES.includes(item.status) &&
    now.getTime() - item.updatedAt.getTime() > STALE_AFTER_MS
  );
}

const DUE_NEVER = Number.MAX_SAFE_INTEGER;

/** Best first for one agent: assigned to it, the closest skill match, due date, age. */
export function rankReady(items: readonly HubItem[], agent: HubAgent) {
  const mine = (item: HubItem) => (item.assigneeAgentId === agent.id ? 0 : 1);
  const matched = (item: HubItem) =>
    item.requiredSkills.filter((skill) => agent.skills.includes(skill)).length;
  return [...items].sort(
    (a, b) =>
      mine(a) - mine(b) ||
      matched(b) - matched(a) ||
      (a.due?.getTime() ?? DUE_NEVER) - (b.due?.getTime() ?? DUE_NEVER) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );
}
