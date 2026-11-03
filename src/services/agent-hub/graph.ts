import type { HubItem, Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { MAX_LINKS_PER_ITEM } from "./constants";
import {
  ASSISTANT_CONNECTION_KEY,
  type HubScope,
  actorAgentId,
} from "./context";
import { type ItemDeps, assertNoCycle, loadDeps, openBlockers } from "./deps";
import { HubError } from "./errors";
import {
  type PreparedItem,
  createdMessage,
  prepareItem,
  viewOne,
  visibleToAgent,
  writeEvents,
} from "./items";
import { assertHubLimitFor, historyWindow } from "./limits";
import type { LinkInput, PlanCreateInput } from "./schemas";
import { emitHubEvent, itemPayload } from "./webhooks";

/**
 * Links between items and plans (a parent item with ordered steps). The rules
 * that matter: only `blocks` changes what can be claimed; `blocks` and
 * `parent` never loop; an agent may constrain only items it created.
 */

const VERB: Record<string, string> = {
  blocks: "blocks",
  parent: "is the parent of",
  relates: "relates to",
  duplicates: "duplicates",
  supersedes: "supersedes",
};

async function loadPair(scope: HubScope, input: LinkInput) {
  const found = await prisma.hubItem.findMany({
    where: {
      id: { in: [input.fromId, input.toId] },
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    },
  });
  const from = found.find((item) => item.id === input.fromId);
  const to = found.find((item) => item.id === input.toId);
  if (!from || !to) throw new HubError("NOT_FOUND", "Item not found.");
  if (scope.actor.kind === "agent") {
    const agent = scope.actor.agent;
    // The assistant reads every item of the owner; other agents only theirs.
    const sees = (item: HubItem) =>
      agent.connectionKey === ASSISTANT_CONNECTION_KEY ||
      visibleToAgent(item, agent);
    if (!sees(from) || !sees(to)) {
      throw new HubError("NOT_FOUND", "Item not found.");
    }
    // The item that would be held back (blocked, or made a child) is the one
    // that must be yours; otherwise any agent could freeze another's work.
    const constrained =
      input.kind === "blocks" || input.kind === "parent" ? to : from;
    if (constrained.creatorAgentId !== agent.id) {
      throw new HubError(
        "FORBIDDEN",
        `Only the agent that created "${constrained.title}" (or the owner) can link it this way.`
      );
    }
  }
  return { from, to };
}

function createdBy(scope: HubScope) {
  return actorAgentId(scope.actor) ?? "owner";
}

function brief(item: HubItem, deps: ItemDeps | undefined) {
  const blockedBy = deps?.blockedBy ?? [];
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    blockedBy,
    ready: item.status === "open" && blockedBy.length === 0,
  };
}

async function briefs(scope: HubScope, items: HubItem[]) {
  const deps = await loadDeps(
    scope,
    items.map((item) => item.id)
  );
  return items.map((item) => brief(item, deps.get(item.id)));
}

/** Adds an edge. Repeating an existing link answers `linked: false`. */
export async function linkItems(scope: HubScope, input: LinkInput) {
  if (input.fromId === input.toId) {
    throw new HubError("INVALID", "An item cannot be linked to itself.");
  }
  const { from, to } = await loadPair(scope, input);

  const existing = await prisma.hubItemLink.findFirst({
    where: {
      OR: [
        { fromId: from.id, toId: to.id, kind: input.kind },
        // Information-only kinds read the same both ways.
        ...(input.kind === "relates"
          ? [{ fromId: to.id, toId: from.id, kind: input.kind }]
          : []),
      ],
    },
  });
  if (existing) {
    return {
      linked: false,
      link: {
        fromId: existing.fromId,
        toId: existing.toId,
        kind: existing.kind,
      },
      items: await briefs(scope, [from, to]),
    };
  }

  const now = newDate();
  await prisma.$transaction(async (tx) => {
    if (input.kind === "blocks" || input.kind === "parent") {
      // One writer at a time per workspace, so two links cannot close a loop
      // between them.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope.workspaceId}))`;
      await assertNoCycle(tx, input.kind, from.id, to.id);
    }
    for (const item of [from, to]) {
      const count = await tx.hubItemLink.count({
        where: { OR: [{ fromId: item.id }, { toId: item.id }] },
      });
      if (count >= MAX_LINKS_PER_ITEM) {
        throw new HubError(
          "INVALID",
          `"${item.title}" already has ${MAX_LINKS_PER_ITEM} links.`
        );
      }
    }
    await tx.hubItemLink.create({
      data: {
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        fromId: from.id,
        toId: to.id,
        kind: input.kind,
        createdBy: createdBy(scope),
      },
    });
    const data = { fromId: from.id, toId: to.id, kind: input.kind };
    const message = `“${from.title}” ${VERB[input.kind]} “${to.title}”.`;
    await writeEvents(
      tx,
      from.id,
      scope.actor,
      [{ type: "linked", message, data }],
      now
    );
    await writeEvents(
      tx,
      to.id,
      scope.actor,
      [{ type: "linked", message, data }],
      now
    );
  });
  const fresh = await prisma.hubItem.findMany({
    where: { id: { in: [from.id, to.id] } },
  });
  return {
    linked: true,
    link: { fromId: from.id, toId: to.id, kind: input.kind },
    items: await briefs(scope, fresh),
  };
}

/** Removes an edge; a dependent that no longer waits on anything is ready. */
export async function unlinkItems(scope: HubScope, input: LinkInput) {
  const { from, to } = await loadPair(scope, input);
  const now = newDate();
  await prisma.$transaction(async (tx) => {
    const removed = await tx.hubItemLink.deleteMany({
      where: { fromId: from.id, toId: to.id, kind: input.kind },
    });
    if (removed.count === 0) throw new HubError("NOT_FOUND", "No such link.");
    const data = { fromId: from.id, toId: to.id, kind: input.kind };
    const message = `Removed: “${from.title}” ${VERB[input.kind]} “${to.title}”.`;
    await writeEvents(
      tx,
      from.id,
      scope.actor,
      [{ type: "unlinked", message, data }],
      now
    );
    await writeEvents(
      tx,
      to.id,
      scope.actor,
      [{ type: "unlinked", message, data }],
      now
    );
    if (
      input.kind === "blocks" &&
      to.status === "open" &&
      (await openBlockers(tx, to.id)).length === 0
    ) {
      await tx.hubItemEvent.create({
        data: {
          itemId: to.id,
          at: newDate(now.getTime() + 2),
          actorKind: "system",
          type: "unblocked",
          fromStatus: "open",
          toStatus: "open",
          message: "Ready to claim: nothing blocks it any more.",
          data: { removedLinkFrom: from.id },
        },
      });
    }
  });
  const fresh = await prisma.hubItem.findMany({
    where: { id: { in: [from.id, to.id] } },
  });
  return { unlinked: true, items: await briefs(scope, fresh) };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

async function planView(scope: HubScope, parentId: string) {
  const parent = await prisma.hubItem.findFirstOrThrow({
    where: { id: parentId },
  });
  const links = await prisma.hubItemLink.findMany({
    where: { fromId: parentId, kind: "parent" },
    orderBy: [{ createdAt: "asc" }],
    select: { toId: true },
  });
  const rows = await prisma.hubItem.findMany({
    where: { id: { in: links.map((link) => link.toId) } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const steps: HubItem[] = [];
  for (const link of links) {
    const row = byId.get(link.toId);
    if (row) steps.push(row);
  }
  // The plan is read once, not once per step.
  const window = await historyWindow(parent.userId);
  const view = { recent: 3, untrusted: true, window };
  return {
    item: await viewOne(scope, parent, view),
    steps: await Promise.all(steps.map((step) => viewOne(scope, step, view))),
  };
}

/**
 * A parent item and its ordered steps in one call. Every brief is checked
 * before anything is written, so a bad step creates nothing. Each step blocks
 * the parent (the wrap-up, ready when all steps are finished) and, with
 * `sequential`, the next step. Repeating the call with the same clientRef
 * returns the plan already made.
 */
export async function createPlan(scope: HubScope, input: PlanCreateInput) {
  const { children, sequential, ...parentInput } = input;
  const creatorAgentId = actorAgentId(scope.actor);

  if (creatorAgentId && parentInput.clientRef) {
    const existing = await prisma.hubItem.findFirst({
      where: {
        userId: scope.userId,
        creatorAgentId,
        clientRef: parentInput.clientRef,
      },
    });
    if (existing) {
      return { created: false, plan: await planView(scope, existing.id) };
    }
  }

  const parent = await prepareItem(scope, parentInput);
  const steps: PreparedItem[] = [];
  for (const [index, child] of children.entries()) {
    try {
      steps.push(await prepareItem(scope, child));
    } catch (error) {
      if (error instanceof HubError) {
        throw new HubError(
          error.code,
          `children[${index}] (“${child.title}”): ${error.message}`,
          { ...(error.extra ?? {}), step: index }
        );
      }
      throw error;
    }
  }

  await assertHubLimitFor(scope.userId, scope.actor, "items", 1 + steps.length);
  const now = newDate();
  const author = createdBy(scope);
  const createdItems: HubItem[] = [];
  const parentId = await prisma.$transaction(async (tx) => {
    const made = await tx.hubItem.create({ data: parent.data });
    createdItems.push(made);
    await writeEvents(
      tx,
      made.id,
      scope.actor,
      [
        {
          type: "created",
          to: "open",
          message: `${createdMessage(parent)} Plan with ${steps.length} ${steps.length === 1 ? "step" : "steps"}; ready when they are finished.`,
        },
      ],
      now
    );
    const ids: string[] = [];
    for (const [index, step] of steps.entries()) {
      const created = await tx.hubItem.create({ data: step.data });
      createdItems.push(created);
      ids.push(created.id);
      await writeEvents(
        tx,
        created.id,
        scope.actor,
        [
          {
            type: "created",
            to: "open",
            message: `Step ${index + 1} of ${steps.length}. ${createdMessage(step)}`,
            data: { planId: made.id, step: index + 1 },
          },
        ],
        now
      );
    }
    const base = {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      createdBy: author,
    };
    // Each link gets its own millisecond so the steps keep their order.
    const links: Prisma.HubItemLinkCreateManyInput[] = [];
    const add = (fromId: string, toId: string, kind: string) =>
      links.push({
        ...base,
        fromId,
        toId,
        kind,
        createdAt: newDate(now.getTime() + links.length),
      });
    ids.forEach((id, index) => {
      add(made.id, id, "parent");
      add(id, made.id, "blocks");
      if (sequential && index > 0) add(ids[index - 1], id, "blocks");
    });
    await tx.hubItemLink.createMany({ data: links });
    return made.id;
  });
  for (const item of createdItems) {
    emitHubEvent(scope, "item.created", { item: itemPayload(item) });
  }
  return { created: true, plan: await planView(scope, parentId) };
}
