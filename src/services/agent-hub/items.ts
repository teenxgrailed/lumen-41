import {
  type HubAgent,
  type HubItem,
  type HubItemEvent,
  Prisma,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

import { TaskStatus } from "@/types/task";

import { findAgentByRef } from "./agents";
import {
  ARCHIVE_AFTER_MS,
  HELD_STATUSES,
  HUB_RISKS,
  LEASE_DEFAULT_MINUTES,
  LEASE_MAX_MINUTES,
  NO_AGENT_TASK_AFTER_MS,
  RESULT_DATA_MAX_BYTES,
  TERMINAL_STATUSES,
} from "./constants";
import {
  type Actor,
  type AgentScope,
  type HubScope,
  type WorkspaceKey,
  actorAgentId,
} from "./context";
import { HubError } from "./errors";
import {
  assertHttpUrl,
  assertProjectInWorkspace,
  assertTaskInWorkspace,
  normalizeLinks,
} from "./links";
import {
  type CancelInput,
  type ClaimInput,
  type CompleteInput,
  type CreateItemInput,
  type EscalateInput,
  type UpdateInput,
  normalizeTags,
} from "./schemas";
import { assertNoSecrets } from "./secret-scan";

type Tx = Prisma.TransactionClient;

export function addMinutes(date: Date, minutes: number) {
  return newDate(date.getTime() + minutes * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface EventInput {
  type: string;
  from?: string | null;
  to?: string | null;
  message?: string;
  data?: Prisma.InputJsonValue;
  /** Defaults to the acting scope; "system" for lazy expiry and sweeps. */
  actor?: Actor | "system";
}

export async function agentNames(
  key: WorkspaceKey,
  ids: readonly (string | null | undefined)[]
) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!wanted.length) return names;
  const rows = await prisma.hubAgent.findMany({
    where: { id: { in: wanted }, userId: key.userId },
    select: { id: true, name: true },
  });
  for (const row of rows) names.set(row.id, row.name);
  return names;
}

export function eventView(event: HubItemEvent, names: Map<string, string>) {
  return {
    at: event.at.toISOString(),
    actor:
      event.actorKind === "agent"
        ? {
            kind: "agent",
            id: event.actorAgentId,
            name:
              (event.actorAgentId && names.get(event.actorAgentId)) || "agent",
          }
        : { kind: event.actorKind },
    type: event.type,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    message: event.message,
    data: event.data ?? null,
  };
}

export interface ItemViewOptions {
  names: Map<string, string>;
  events?: HubItemEvent[];
  latest?: HubItemEvent | null;
  noCapableAgent?: boolean;
  /** Mark text written by another agent as peer data (agent callers). */
  untrusted?: boolean;
  now?: Date;
}

export function itemView(item: HubItem, options: ItemViewOptions) {
  const { names } = options;
  const now = options.now ?? newDate();
  const leaseExpired =
    HELD_STATUSES.includes(item.status) &&
    Boolean(
      item.leaseExpiresAt && item.leaseExpiresAt.getTime() < now.getTime()
    );
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    goal: item.goal,
    doneCriteria: item.doneCriteria,
    context: item.context,
    links: item.links,
    risks: item.risks,
    approvals: item.approvals,
    assignee: item.assigneeAgentId
      ? {
          id: item.assigneeAgentId,
          name: names.get(item.assigneeAgentId) ?? "agent",
        }
      : "any",
    requiredSkills: item.requiredSkills,
    creator:
      item.creatorKind === "owner"
        ? { kind: "owner" }
        : {
            kind: "agent",
            id: item.creatorAgentId,
            name:
              (item.creatorAgentId && names.get(item.creatorAgentId)) ||
              "agent",
          },
    heldBy: item.claimedByAgentId
      ? {
          id: item.claimedByAgentId,
          name: names.get(item.claimedByAgentId) ?? "agent",
        }
      : null,
    leaseExpiresAt: item.leaseExpiresAt?.toISOString() ?? null,
    leaseExpired,
    due: item.due?.toISOString() ?? null,
    result: item.result ?? null,
    criteriaNotMet:
      item.status === "done" &&
      Boolean(
        item.result &&
          typeof item.result === "object" &&
          !Array.isArray(item.result) &&
          (item.result as { criteriaMet?: unknown }).criteriaMet === false
      ),
    blockedOn: item.blockedOn,
    question: item.question,
    taskId: item.taskId,
    projectId: item.projectId,
    escalationTaskId: item.escalationTaskId,
    noAgentTaskId: item.noAgentTaskId,
    noCapableAgent: options.noCapableAgent ?? false,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    closedAt: item.closedAt?.toISOString() ?? null,
    latestEvent: options.latest ? eventView(options.latest, names) : null,
    ...(options.events
      ? { events: options.events.map((event) => eventView(event, names)) }
      : {}),
    ...(options.untrusted ? { untrusted: true } : {}),
  };
}

async function latestEvents(itemIds: readonly string[]) {
  if (!itemIds.length) return new Map<string, HubItemEvent>();
  const rows = await prisma.hubItemEvent.findMany({
    where: { itemId: { in: [...itemIds] } },
    orderBy: [{ at: "desc" }],
    distinct: ["itemId"],
  });
  return new Map(rows.map((row) => [row.itemId, row]));
}

async function recentEvents(itemId: string, take: number) {
  const rows = await prisma.hubItemEvent.findMany({
    where: { itemId },
    orderBy: [{ at: "desc" }],
    take,
  });
  return rows.reverse();
}

async function allEvents(itemId: string) {
  return prisma.hubItemEvent.findMany({
    where: { itemId },
    orderBy: [{ at: "asc" }],
  });
}

/** Whether every required skill is among the agent's skills. */
export function skillsCover(
  skills: readonly string[],
  required: readonly string[]
) {
  return required.every((skill) => skills.includes(skill));
}

/** Open "any" items nobody registered can do. */
export async function unmatchedItemIds(
  key: WorkspaceKey,
  items: readonly HubItem[]
): Promise<Set<string>> {
  const candidates = items.filter(
    (item) => item.status === "open" && !item.assigneeAgentId
  );
  if (!candidates.length) return new Set();
  const agents = await prisma.hubAgent.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      disabledAt: null,
    },
    select: { skills: true },
  });
  return new Set(
    candidates
      .filter(
        (item) =>
          !agents.some((agent) =>
            skillsCover(agent.skills, item.requiredSkills)
          )
      )
      .map((item) => item.id)
  );
}

// ---------------------------------------------------------------------------
// Writing: events and optimistic transitions
// ---------------------------------------------------------------------------

function eventData(
  itemId: string,
  scopeActor: Actor | undefined,
  event: EventInput,
  at: Date
): Prisma.HubItemEventUncheckedCreateInput {
  const actor = event.actor ?? scopeActor ?? "system";
  return {
    itemId,
    at,
    actorKind: actor === "system" ? "system" : actor.kind,
    actorAgentId: actor === "system" ? null : actorAgentId(actor),
    type: event.type,
    fromStatus: event.from ?? null,
    toStatus: event.to ?? null,
    message: (event.message ?? "").slice(0, 2000),
    ...(event.data !== undefined ? { data: event.data } : {}),
  };
}

async function writeEvents(
  tx: Tx,
  itemId: string,
  scopeActor: Actor | undefined,
  events: readonly EventInput[],
  now: Date
) {
  // Events written together keep their order: the database default time is the
  // transaction start, so give each its own millisecond.
  let offset = 0;
  for (const event of events) {
    await tx.hubItemEvent.create({
      data: eventData(
        itemId,
        scopeActor,
        event,
        newDate(now.getTime() + offset)
      ),
    });
    offset += 1;
  }
}

interface Plan {
  data: Prisma.HubItemUncheckedUpdateManyInput;
  events: EventInput[];
  after?: (tx: Tx) => Promise<void>;
}

/**
 * One transition: read the item in this workspace, let `plan` decide, write it
 * with an optimistic version check, append the events in the same
 * transaction. A concurrent change makes the second writer `STALE`.
 */
async function mutateItem(
  scope: HubScope,
  id: string,
  expectedVersion: number | undefined,
  plan: (item: HubItem, tx: Tx, now: Date) => Promise<Plan> | Plan
) {
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.hubItem.findFirst({
      where: { id, userId: scope.userId, workspaceId: scope.workspaceId },
    });
    if (!item) throw new HubError("NOT_FOUND", "Item not found.");
    if (expectedVersion !== undefined && item.version !== expectedVersion) {
      throw new HubError(
        "STALE",
        `The item changed (version ${item.version}, you sent ${expectedVersion}). Read it again.`,
        { version: item.version }
      );
    }
    const now = newDate();
    const { data, events, after } = await plan(item, tx, now);
    const written = await tx.hubItem.updateMany({
      where: { id, version: item.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (written.count === 0) {
      throw new HubError(
        "STALE",
        "The item changed while you were writing. Read it again."
      );
    }
    await writeEvents(tx, id, scope.actor, events, now);
    if (after) await after(tx);
    return tx.hubItem.findUniqueOrThrow({ where: { id } });
  });
  return updated;
}

async function viewOne(
  scope: WorkspaceKey,
  item: HubItem,
  extra: Partial<ItemViewOptions> & { fullLog?: boolean; recent?: number } = {}
) {
  const events = extra.fullLog
    ? await allEvents(item.id)
    : extra.recent
      ? await recentEvents(item.id, extra.recent)
      : undefined;
  const latest = events?.length
    ? events[events.length - 1]
    : ((await latestEvents([item.id])).get(item.id) ?? null);
  const names = await agentNames(scope, [
    item.assigneeAgentId,
    item.creatorAgentId,
    item.claimedByAgentId,
    ...(events ?? []).map((event) => event.actorAgentId),
  ]);
  const unmatched = await unmatchedItemIds(scope, [item]);
  return itemView(item, {
    names,
    events,
    latest,
    noCapableAgent: unmatched.has(item.id),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Lazy lease expiry
// ---------------------------------------------------------------------------

/**
 * Writes `lease_expired` once for each held item whose lease has passed. The
 * item itself stays with its holder until someone else claims it, so a
 * holder that returns first can carry on.
 */
export async function noteExpiredLeases(key: WorkspaceKey, itemId?: string) {
  const now = newDate();
  const due = await prisma.hubItem.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      status: { in: [...HELD_STATUSES] },
      leaseExpiresAt: { lt: now },
      leaseExpiredNotedAt: null,
      ...(itemId ? { id: itemId } : {}),
    },
    select: { id: true, status: true, claimedByAgentId: true },
    take: 100,
  });
  for (const row of due) {
    await prisma.$transaction(async (tx) => {
      const marked = await tx.hubItem.updateMany({
        where: {
          id: row.id,
          leaseExpiredNotedAt: null,
          status: { in: [...HELD_STATUSES] },
          leaseExpiresAt: { lt: now },
        },
        data: { leaseExpiredNotedAt: now },
      });
      if (marked.count === 0) return;
      await tx.hubItemEvent.create({
        data: {
          itemId: row.id,
          at: now,
          actorKind: "system",
          type: "lease_expired",
          fromStatus: row.status,
          toStatus: row.status,
          message:
            "The lease ended without an update; another eligible agent may claim it.",
          data: { heldBy: row.claimedByAgentId },
        },
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function parseDue(value: string | undefined): Date | null {
  if (!value) return null;
  const date = newDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new HubError("INVALID", "due must be an ISO 8601 date or date-time.");
  }
  return date;
}

function assertBrief(input: CreateItemInput) {
  const need = (ok: boolean, field: string, why: string) => {
    if (!ok) throw new HubError("INVALID", `${field}: ${why}`, { field });
  };
  need(input.title.trim().length > 0, "title", "add a short title.");
  need(
    input.goal.trim().length >= 20,
    "goal",
    "describe the goal in at least 20 characters."
  );
  need(
    input.doneCriteria.trim().length > 0,
    "doneCriteria",
    "say how the other agent knows it is done."
  );
  need(
    input.context.trim().length >= 40,
    "context",
    "give at least 40 characters of context: the other agent cannot ask you."
  );
  need(
    Array.isArray(input.risks),
    "risks",
    `state the risks explicitly: any of ${HUB_RISKS.join(", ")}, or [] for none.`
  );
}

export async function createItem(scope: HubScope, input: CreateItemInput) {
  assertBrief(input);
  assertNoSecrets({
    title: input.title,
    goal: input.goal,
    doneCriteria: input.doneCriteria,
    context: input.context,
    links: input.links,
    clientRef: input.clientRef,
  });
  const creatorAgentId = actorAgentId(scope.actor);

  if (creatorAgentId && input.clientRef) {
    const existing = await prisma.hubItem.findFirst({
      where: {
        userId: scope.userId,
        creatorAgentId,
        clientRef: input.clientRef,
      },
    });
    if (existing) {
      return {
        created: false,
        item: await viewOne(scope, existing, { recent: 5, untrusted: true }),
      };
    }
  }

  let assigneeAgentId: string | null = null;
  let requiredSkills: string[] = [];
  if (input.assignee.trim().toLowerCase() === "any") {
    requiredSkills = normalizeTags(input.requiredSkills, 10);
    if (!requiredSkills.length) {
      throw new HubError(
        "INVALID",
        'requiredSkills: an item for "any" agent needs at least one required skill, so only capable agents see it.',
        { field: "requiredSkills" }
      );
    }
  } else {
    const agent = await findAgentByRef(scope, input.assignee);
    if (!agent || agent.disabledAt) {
      throw new HubError(
        "INVALID",
        `assignee: no agent "${input.assignee}" in this workspace. List agents with needt_agents_list, or use "any" with requiredSkills.`,
        { field: "assignee" }
      );
    }
    assigneeAgentId = agent.id;
    requiredSkills = normalizeTags(input.requiredSkills, 10);
  }

  const links = await normalizeLinks(scope, input.links);
  if (input.taskId) await assertTaskInWorkspace(scope, input.taskId);
  if (input.projectId) await assertProjectInWorkspace(scope, input.projectId);
  const due = parseDue(input.due);
  const now = newDate();

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.hubItem.create({
        data: {
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          title: input.title.trim(),
          goal: input.goal.trim(),
          doneCriteria: input.doneCriteria.trim(),
          context: input.context.trim(),
          links,
          risks: [...new Set(input.risks)],
          status: "open",
          assigneeAgentId,
          requiredSkills,
          creatorKind: scope.actor.kind,
          creatorAgentId,
          due,
          taskId: input.taskId ?? null,
          projectId: input.projectId ?? null,
          clientRef: input.clientRef ?? null,
        },
      });
      await writeEvents(
        tx,
        created.id,
        scope.actor,
        [
          {
            type: "created",
            to: "open",
            message: assigneeAgentId
              ? "Created and assigned."
              : `Created for any agent with: ${requiredSkills.join(", ")}.`,
          },
        ],
        now
      );
      return created;
    });
    return {
      created: true,
      item: await viewOne(scope, item, { recent: 5, untrusted: true }),
    };
  } catch (error) {
    // Two creates with the same clientRef at once: the loser returns the winner.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      creatorAgentId &&
      input.clientRef
    ) {
      const existing = await prisma.hubItem.findFirst({
        where: {
          userId: scope.userId,
          creatorAgentId,
          clientRef: input.clientRef,
        },
      });
      if (existing) {
        return {
          created: false,
          item: await viewOne(scope, existing, { recent: 5, untrusted: true }),
        };
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

function leaseMinutes(requested: number | undefined) {
  return Math.min(
    Math.max(requested ?? LEASE_DEFAULT_MINUTES, 1),
    LEASE_MAX_MINUTES
  );
}

function assertEligible(item: HubItem, agent: HubAgent) {
  if (item.assigneeAgentId && item.assigneeAgentId !== agent.id) {
    throw new HubError(
      "NOT_ELIGIBLE",
      "This item is assigned to another agent."
    );
  }
  if (!skillsCover(agent.skills, item.requiredSkills)) {
    throw new HubError(
      "NOT_ELIGIBLE",
      `This item needs the skills: ${item.requiredSkills.join(", ")}. Add them with needt_agent_register if you can do the work.`,
      { requiredSkills: item.requiredSkills }
    );
  }
}

const riskNotice = (risks: readonly string[]) =>
  risks.length
    ? `This item declares risks: ${risks.join(", ")}. Before doing any of these, escalate with needt_agent_task_escalate and wait for the owner to approve; completing as done is refused until every risk is approved.`
    : null;

/**
 * Claims an item for the calling agent: one atomic conditional update, so at
 * most one agent holds it. A live lease held by someone else is a conflict.
 */
export async function claimItem(scope: AgentScope, input: ClaimInput) {
  const agent = scope.actor.agent;
  await noteExpiredLeases(scope, input.id);

  const item = await prisma.hubItem.findFirst({
    where: {
      id: input.id,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!item) throw new HubError("NOT_FOUND", "Item not found.");
  if (TERMINAL_STATUSES.includes(item.status)) {
    throw new HubError("TERMINAL", `This item is already ${item.status}.`);
  }
  if (item.status === "needs_owner") {
    throw new HubError(
      "NEEDS_OWNER",
      "This item waits for the owner's answer; it returns to the inbox when answered."
    );
  }
  assertEligible(item, agent);

  const now = newDate();
  const mine = item.claimedByAgentId === agent.id;
  // Keep the working status when the holder claims again.
  const status =
    mine && (item.status === "in_progress" || item.status === "blocked")
      ? item.status
      : "claimed";
  const leaseEnd = addMinutes(now, leaseMinutes(input.leaseMinutes));

  const claimed = await prisma.$transaction(async (tx) => {
    const written = await tx.hubItem.updateMany({
      where: {
        id: item.id,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        // The item is free, or its lease has passed, or this agent holds it.
        OR: [
          { status: "open" },
          {
            status: { in: [...HELD_STATUSES] },
            OR: [
              { leaseExpiresAt: { lt: now } },
              { claimedByAgentId: agent.id },
            ],
          },
        ],
        AND: [
          { OR: [{ assigneeAgentId: null }, { assigneeAgentId: agent.id }] },
        ],
      },
      data: {
        status,
        claimedByAgentId: agent.id,
        leaseExpiresAt: leaseEnd,
        leaseExpiredNotedAt: null,
        version: { increment: 1 },
      },
    });
    if (written.count === 0) return null;
    await writeEvents(
      tx,
      item.id,
      scope.actor,
      [
        {
          type: "claimed",
          from: item.status,
          to: status,
          message: `Claimed until ${leaseEnd.toISOString()}.`,
          data: { leaseMinutes: leaseMinutes(input.leaseMinutes) },
        },
      ],
      now
    );
    return tx.hubItem.findUniqueOrThrow({ where: { id: item.id } });
  });

  if (!claimed) {
    const holder = await prisma.hubItem.findFirst({
      where: { id: item.id },
      select: { claimedByAgentId: true, leaseExpiresAt: true, status: true },
    });
    const names = await agentNames(scope, [holder?.claimedByAgentId]);
    throw new HubError(
      "ALREADY_CLAIMED",
      `Held by ${(holder?.claimedByAgentId && names.get(holder.claimedByAgentId)) || "another agent"} until ${holder?.leaseExpiresAt?.toISOString() ?? "its lease ends"}.`,
      {
        heldBy: holder?.claimedByAgentId
          ? {
              id: holder.claimedByAgentId,
              name: names.get(holder.claimedByAgentId) ?? "agent",
            }
          : null,
        leaseExpiresAt: holder?.leaseExpiresAt?.toISOString() ?? null,
      }
    );
  }
  return {
    item: await viewOne(scope, claimed, { recent: 5, untrusted: true }),
    risks: claimed.risks,
    notice: riskNotice(claimed.risks),
  };
}

// ---------------------------------------------------------------------------
// Holder operations: update, complete, escalate
// ---------------------------------------------------------------------------

function assertOpenForAgents(item: HubItem) {
  if (TERMINAL_STATUSES.includes(item.status)) {
    throw new HubError(
      "TERMINAL",
      `This item is ${item.status}; a finished item takes no further change.`
    );
  }
  if (item.status === "needs_owner") {
    throw new HubError(
      "NEEDS_OWNER",
      "This item waits for the owner. Only the owner can answer it, on the Agents screen."
    );
  }
}

function assertHolder(item: HubItem, agent: HubAgent) {
  assertOpenForAgents(item);
  if (!HELD_STATUSES.includes(item.status) || !item.claimedByAgentId) {
    throw new HubError(
      "NOT_HELD",
      "Claim this item first with needt_agent_task_claim."
    );
  }
  if (item.claimedByAgentId !== agent.id) {
    throw new HubError(
      "LEASE_LOST",
      "Another agent holds this item now (your lease ended and it was claimed).",
      { heldBy: item.claimedByAgentId }
    );
  }
}

/** A progress message, a status change (working or blocked), or a heartbeat. */
export async function updateItem(scope: AgentScope, input: UpdateInput) {
  const agent = scope.actor.agent;
  const message = input.message?.trim() ?? "";
  if (!message && !input.status && !input.heartbeat) {
    throw new HubError(
      "INVALID",
      "Send a message, a status, or heartbeat: true."
    );
  }
  if (input.status === "blocked" && !input.blockedOn?.trim()) {
    throw new HubError(
      "INVALID",
      "blockedOn: say what the item waits on. Use needt_agent_task_escalate to wait for the owner.",
      { field: "blockedOn" }
    );
  }
  assertNoSecrets({ message, blockedOn: input.blockedOn });

  const updated = await mutateItem(
    scope,
    input.id,
    input.expectedVersion,
    (item, _tx, now) => {
      assertHolder(item, agent);
      const next =
        input.status ??
        (item.status === "claimed" ? "in_progress" : item.status);
      const leaseEnd = addMinutes(now, leaseMinutes(input.leaseMinutes));
      const changed = next !== item.status;
      return {
        data: {
          status: next,
          leaseExpiresAt: leaseEnd,
          leaseExpiredNotedAt: null,
          blockedOn:
            next === "blocked"
              ? (input.blockedOn?.trim() ?? item.blockedOn)
              : null,
        },
        events: [
          {
            type: changed ? "status" : message ? "update" : "heartbeat",
            from: item.status,
            to: next,
            message,
            data: { leaseExpiresAt: leaseEnd.toISOString() },
          },
        ],
      };
    }
  );
  return {
    item: await viewOne(scope, updated, { recent: 3, untrusted: true }),
  };
}

function approvalsMissing(item: HubItem) {
  const approvals =
    item.approvals &&
    typeof item.approvals === "object" &&
    !Array.isArray(item.approvals)
      ? (item.approvals as Record<string, unknown>)
      : {};
  return item.risks.filter((risk) => !approvals[risk]);
}

/** Finishes the item as done or failed with a structured result. */
export async function completeItem(scope: AgentScope, input: CompleteInput) {
  const agent = scope.actor.agent;
  const summary = input.result.summary.trim();
  if (!summary) {
    throw new HubError(
      "INVALID",
      "result.summary: say what was done or why it failed.",
      {
        field: "result.summary",
      }
    );
  }
  if (input.outcome === "done" && input.criteriaMet === undefined) {
    throw new HubError(
      "INVALID",
      "criteriaMet: say whether the done-criteria were met (true or false) with a one-line criteriaNote.",
      { field: "criteriaMet" }
    );
  }
  const links = (input.result.links ?? []).map((link) => ({
    label: link.label.trim(),
    url: assertHttpUrl("result.links", link.url),
  }));
  const dataBytes = Buffer.byteLength(
    JSON.stringify(input.result.data ?? {}),
    "utf8"
  );
  if (dataBytes > RESULT_DATA_MAX_BYTES) {
    throw new HubError(
      "INVALID",
      `result.data is ${dataBytes} bytes; the limit is ${RESULT_DATA_MAX_BYTES}.`,
      {
        field: "result.data",
      }
    );
  }
  assertNoSecrets({
    result: { summary, links: input.result.links, data: input.result.data },
    criteriaNote: input.criteriaNote,
  });

  const updated = await mutateItem(
    scope,
    input.id,
    input.expectedVersion,
    (item, _tx, now) => {
      assertHolder(item, agent);
      if (input.outcome === "done") {
        const missing = approvalsMissing(item);
        if (missing.length) {
          throw new HubError(
            "APPROVAL_REQUIRED",
            `The owner has not approved: ${missing.join(", ")}. Escalate with needt_agent_task_escalate and wait for approval before completing.`,
            { missing }
          );
        }
      }
      const result: Prisma.InputJsonObject = {
        outcome: input.outcome,
        summary,
        links,
        ...(input.result.data
          ? { data: input.result.data as Prisma.InputJsonObject }
          : {}),
        ...(input.criteriaMet !== undefined
          ? {
              criteriaMet: input.criteriaMet,
              criteriaNote: input.criteriaNote?.trim() ?? "",
            }
          : {}),
      };
      return {
        data: {
          status: input.outcome,
          result,
          leaseExpiresAt: null,
          leaseExpiredNotedAt: null,
          blockedOn: null,
          closedAt: now,
        },
        events: [
          {
            type: input.outcome === "done" ? "completed" : "failed",
            from: item.status,
            to: input.outcome,
            message: summary,
            data: {
              ...(input.criteriaMet !== undefined
                ? { criteriaMet: input.criteriaMet }
                : {}),
              links,
            },
          },
        ],
      };
    }
  );
  return {
    item: await viewOne(scope, updated, { recent: 3, untrusted: true }),
  };
}

/** A normal Needt task for the owner, created inside the caller's transaction. */
async function createOwnerTask(
  tx: Tx,
  input: {
    id?: string;
    userId: string;
    workspaceId: string;
    title: string;
    description: string;
  }
) {
  return tx.task.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      userId: input.userId,
      workspaceId: input.workspaceId,
      assigneeId: input.userId,
      title: input.title.slice(0, 120),
      description: input.description,
      status: TaskStatus.TODO,
      isAutoScheduled: false,
      autoScheduled: false,
      activities: {
        create: {
          workspaceId: input.workspaceId,
          actorId: input.userId,
          action: "CREATED",
        },
      },
    },
    select: { id: true },
  });
}

const itemLink = (id: string) => `/agents?item=${id}`;

/**
 * The agent cannot go on without the owner: sets needs_owner, releases the
 * lease, and creates exactly one Needt task for the person. Completing that
 * task does not answer or approve; only the Agents screen does.
 */
export async function escalateItem(scope: AgentScope, input: EscalateInput) {
  const agent = scope.actor.agent;
  assertNoSecrets({ question: input.question, options: input.options });
  const question = input.question.trim();
  const updated = await mutateItem(
    scope,
    input.id,
    input.expectedVersion,
    async (item, tx) => {
      assertOpenForAgents(item);
      const allowed =
        item.claimedByAgentId === agent.id ||
        (item.status === "open" &&
          (item.assigneeAgentId === agent.id ||
            item.creatorAgentId === agent.id));
      if (!allowed) {
        throw new HubError(
          "NOT_HELD",
          "Only the agent holding the item (or its creator or assignee while it is open) can escalate it."
        );
      }
      const options = (input.options ?? []).map((option) => option.trim());
      const task = await createOwnerTask(tx, {
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        title: `Decide: ${item.title}`,
        description: [
          `${agent.name} asks: ${question}`,
          options.length ? `Options: ${options.join(" / ")}` : null,
          input.risk ? `Risk: ${input.risk}` : null,
          `Answer or approve on the Agents screen: ${itemLink(item.id)}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      return {
        data: {
          status: "needs_owner",
          question,
          claimedByAgentId: null,
          leaseExpiresAt: null,
          leaseExpiredNotedAt: null,
          // The answer returns to the agent that asked.
          assigneeAgentId: agent.id,
          escalationTaskId: task.id,
          blockedOn: null,
        },
        events: [
          {
            type: "escalated",
            from: item.status,
            to: "needs_owner",
            message: question,
            data: {
              ...(options.length ? { options } : {}),
              ...(input.risk ? { risk: input.risk } : {}),
              taskId: task.id,
            },
          },
        ],
      };
    }
  );
  await publishRealtimeEventSafe(scope.userId, "tasks-updated");
  return {
    item: await viewOne(scope, updated, { recent: 3, untrusted: true }),
    ownerTaskId: updated.escalationTaskId,
  };
}

/** The creator (or the owner) withdraws an item that is not finished. */
export async function cancelItem(scope: HubScope, input: CancelInput) {
  assertNoSecrets({ reason: input.reason });
  const updated = await mutateItem(
    scope,
    input.id,
    undefined,
    (item, _tx, now) => {
      if (TERMINAL_STATUSES.includes(item.status)) {
        throw new HubError("TERMINAL", `This item is already ${item.status}.`);
      }
      if (
        scope.actor.kind === "agent" &&
        item.creatorAgentId !== scope.actor.agent.id
      ) {
        throw new HubError(
          "FORBIDDEN",
          "Only the agent that created an item (or the owner) can cancel it."
        );
      }
      return {
        data: {
          status: "cancelled",
          claimedByAgentId: null,
          leaseExpiresAt: null,
          leaseExpiredNotedAt: null,
          closedAt: now,
        },
        events: [
          {
            type: "cancelled",
            from: item.status,
            to: "cancelled",
            message: input.reason?.trim() ?? "",
          },
        ],
      };
    }
  );
  return {
    item: await viewOne(scope, updated, {
      recent: 3,
      untrusted: scope.actor.kind === "agent",
    }),
  };
}

// ---------------------------------------------------------------------------
// Owner operations
// ---------------------------------------------------------------------------

function assertOwner(scope: HubScope) {
  if (scope.actor.kind !== "owner") {
    throw new HubError(
      "FORBIDDEN",
      "Only the owner can do this, on the Agents screen. Agent tokens and OAuth clients cannot."
    );
  }
}

/**
 * The owner answers a needs_owner item with text: it returns to open for the
 * agent that escalated, and the linked Needt task is completed.
 */
export async function ownerAnswer(scope: HubScope, id: string, answer: string) {
  assertOwner(scope);
  const text = answer.trim();
  if (!text) throw new HubError("INVALID", "answer cannot be empty.");
  assertNoSecrets({ answer: text });
  const updated = await mutateItem(
    scope,
    id,
    undefined,
    async (item, tx, now) => {
      if (item.status !== "needs_owner") {
        throw new HubError(
          "NOT_HELD",
          "This item is not waiting for an answer."
        );
      }
      let taskCompleted = false;
      if (item.escalationTaskId) {
        const done = await tx.task.updateMany({
          where: {
            id: item.escalationTaskId,
            status: { not: TaskStatus.COMPLETED },
          },
          data: { status: TaskStatus.COMPLETED, completedAt: now },
        });
        taskCompleted = done.count > 0;
      }
      return {
        data: { status: "open", question: null },
        events: [
          {
            type: "owner_answer",
            from: "needs_owner",
            to: "open",
            message: text,
            data: { taskCompleted },
          },
        ],
      };
    }
  );
  await publishRealtimeEventSafe(scope.userId, "tasks-updated");
  return { item: await viewOne(scope, updated, { recent: 5 }) };
}

/** The owner approves declared risks, one by one or together. */
export async function ownerApprove(
  scope: HubScope,
  id: string,
  input: { risks: readonly string[]; note?: string }
) {
  assertOwner(scope);
  assertNoSecrets({ note: input.note });
  const updated = await mutateItem(scope, id, undefined, (item, _tx, now) => {
    if (TERMINAL_STATUSES.includes(item.status)) {
      throw new HubError("TERMINAL", `This item is already ${item.status}.`);
    }
    if (!item.risks.length) {
      throw new HubError(
        "INVALID",
        "This item declares no risks, so there is nothing to approve."
      );
    }
    const unknown = input.risks.filter((risk) => !item.risks.includes(risk));
    if (unknown.length) {
      throw new HubError(
        "INVALID",
        `Not declared on this item: ${unknown.join(", ")}.`
      );
    }
    const current =
      item.approvals &&
      typeof item.approvals === "object" &&
      !Array.isArray(item.approvals)
        ? (item.approvals as Record<string, Prisma.InputJsonValue>)
        : {};
    const approvals: Record<string, Prisma.InputJsonValue> = { ...current };
    for (const risk of input.risks) {
      approvals[risk] = {
        approvedAt: now.toISOString(),
        by: "owner",
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      };
    }
    return {
      data: { approvals },
      events: [
        {
          type: "approved",
          from: item.status,
          to: item.status,
          message: input.note?.trim() ?? "",
          data: { risks: [...input.risks] },
        },
      ],
    };
  });
  return { item: await viewOne(scope, updated, { recent: 5 }) };
}

/** The owner hands an unclaimed item to another agent (or to "any" with skills). */
export async function ownerReassign(
  scope: HubScope,
  id: string,
  input: { assignee: string; requiredSkills?: string[] }
) {
  assertOwner(scope);
  let assigneeAgentId: string | null = null;
  let requiredSkills: string[] | undefined;
  if (input.assignee.trim().toLowerCase() === "any") {
    requiredSkills = normalizeTags(input.requiredSkills, 10);
    if (!requiredSkills.length) {
      throw new HubError(
        "INVALID",
        'requiredSkills: "any" needs at least one skill.'
      );
    }
  } else {
    const agent = await findAgentByRef(scope, input.assignee);
    if (!agent || agent.disabledAt) {
      throw new HubError("INVALID", `No agent "${input.assignee}".`);
    }
    assigneeAgentId = agent.id;
    if (input.requiredSkills)
      requiredSkills = normalizeTags(input.requiredSkills, 10);
  }
  const updated = await mutateItem(scope, id, undefined, (item) => {
    if (item.status !== "open") {
      throw new HubError(
        "INVALID",
        "Only an open, unclaimed item can be reassigned."
      );
    }
    return {
      data: {
        assigneeAgentId,
        ...(requiredSkills ? { requiredSkills } : {}),
      },
      events: [
        {
          type: "reassigned",
          from: item.status,
          to: item.status,
          message: assigneeAgentId
            ? "Reassigned by the owner."
            : "Opened to any capable agent.",
          data: { assigneeAgentId },
        },
      ],
    };
  });
  return { item: await viewOne(scope, updated, { recent: 5 }) };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function visibleToAgent(item: HubItem, agent: HubAgent) {
  return (
    item.creatorAgentId === agent.id ||
    item.assigneeAgentId === agent.id ||
    item.claimedByAgentId === agent.id ||
    (item.status === "open" &&
      !item.assigneeAgentId &&
      skillsCover(agent.skills, item.requiredSkills))
  );
}

/** One item with its full log; an agent sees only items that concern it. */
export async function getItem(scope: HubScope, id: string) {
  await noteExpiredLeases(scope, id);
  const item = await prisma.hubItem.findFirst({
    where: { id, userId: scope.userId, workspaceId: scope.workspaceId },
  });
  if (
    !item ||
    (scope.actor.kind === "agent" && !visibleToAgent(item, scope.actor.agent))
  ) {
    throw new HubError("NOT_FOUND", "Item not found.");
  }
  return {
    item: await viewOne(scope, item, {
      fullLog: true,
      untrusted: scope.actor.kind === "agent",
    }),
  };
}

function archiveWhere(includeArchived: boolean): Prisma.HubItemWhereInput {
  if (includeArchived) return {};
  const cutoff = newDate(newDate().getTime() - ARCHIVE_AFTER_MS);
  return { OR: [{ closedAt: null }, { closedAt: { gte: cutoff } }] };
}

/** The Work list for the screen and the owner REST route. */
export async function listItems(
  key: WorkspaceKey,
  options: { includeArchived?: boolean; limit?: number } = {}
) {
  await sweepForList(key);
  const items = await prisma.hubItem.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      ...archiveWhere(Boolean(options.includeArchived)),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(options.limit ?? 200, 500),
  });
  const [latest, unmatched, names] = await Promise.all([
    latestEvents(items.map((item) => item.id)),
    unmatchedItemIds(key, items),
    agentNames(
      key,
      items.flatMap((item) => [
        item.assigneeAgentId,
        item.creatorAgentId,
        item.claimedByAgentId,
      ])
    ),
  ]);
  const eventNames = await agentNames(
    key,
    [...latest.values()].map((event) => event.actorAgentId)
  );
  for (const [id, name] of eventNames) names.set(id, name);
  const now = newDate();
  return items.map((item) =>
    itemView(item, {
      names,
      latest: latest.get(item.id) ?? null,
      noCapableAgent: unmatched.has(item.id),
      now,
    })
  );
}

// Defined in sweep.ts; imported lazily to keep the module graph acyclic.
async function sweepForList(key: WorkspaceKey) {
  const { sweepHub } = await import("./sweep");
  await sweepHub(key);
}

export { createOwnerTask, mutateItem, latestEvents, recentEvents, viewOne };
