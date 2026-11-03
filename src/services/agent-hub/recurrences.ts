import { type HubAgent, type HubRecurrence, Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { canUseHubRecurring } from "@/lib/entitlements";
import { agentHubEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  RECURRENCE_MAX_PER_USER,
  RECURRENCE_SWEEP_BATCH,
  TERMINAL_STATUSES,
} from "./constants";
import type { Actor, HubScope, WorkspaceKey } from "./context";
import { HubError } from "./errors";
import { type CreateItemHooks, createItem, writeEvents } from "./items";
import { assertHubLimitFor } from "./limits";
import { trackHub } from "./metrics";
import {
  assertRecurrence,
  describeRule,
  nextOccurrence,
} from "./recurrence-rule";
import type {
  CreateItemWithRecurrenceInput,
  RecurrenceUpdateInput,
  RecurrencesListInput,
} from "./schemas";

const LOG_SOURCE = "agent-hub-recurrence";

/**
 * Recurring hub items. A HubRecurrence holds the brief of an item and an RRULE;
 * the worker (every five minutes) opens a fresh item from each due one. Pro
 * only. A missed run is not caught up: after downtime the series continues
 * from the next occurrence after now, so a restart never floods the inbox.
 */

export type SkipReason =
  | "hub_disabled"
  | "plan"
  | "plan_limit"
  | "previous_open"
  | "assignee_unavailable"
  | "creator_unavailable"
  | "invalid_rule";

const SKIP_TEXT: Record<SkipReason, string> = {
  hub_disabled: "The agent hub is off for this account.",
  plan: "Recurring items need the Pro plan.",
  plan_limit: "The Free plan's open-item limit was reached.",
  previous_open: "The previous occurrence is still open.",
  assignee_unavailable: "The assigned agent is gone or disabled.",
  creator_unavailable: "The agent that created this is gone or disabled.",
  invalid_rule: "The schedule could not be read; the recurrence was paused.",
};

export async function assertRecurrenceAllowed(userId: string) {
  const gate = await canUseHubRecurring(userId);
  if (gate.allowed) return;
  throw new HubError(
    "PLAN_LIMIT",
    "Recurring hub items are a Pro feature. Upgrade to Pro to repeat an item on a schedule.",
    {
      resource: "recurrence",
      plan: gate.plan,
      upgradeRequired: true,
    }
  );
}

async function defaultTimeZone(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return settings?.timeZone || "UTC";
}

function cleanRule(rrule: string) {
  return rrule.trim().replace(/^RRULE:/i, "");
}

/** The state a person sees: active, paused, or ended (no more occurrences). */
function stateOf(row: Pick<HubRecurrence, "active" | "nextRunAt">) {
  if (!row.nextRunAt) return "ended" as const;
  return row.active ? ("active" as const) : ("paused" as const);
}

export function recurrenceView(
  row: HubRecurrence,
  names: Map<string, string> = new Map()
) {
  return {
    id: row.id,
    title: row.title,
    state: stateOf(row),
    active: row.active,
    rrule: row.rrule,
    timezone: row.timezone,
    repeats: describeRule(row.rrule, row.timezone),
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    allowOverlap: row.allowOverlap,
    assignee: row.assigneeAgentId
      ? {
          id: row.assigneeAgentId,
          name: names.get(row.assigneeAgentId) ?? "agent",
        }
      : "any",
    requiredSkills: row.requiredSkills,
    creator:
      row.creatorKind === "owner"
        ? { kind: "owner" }
        : {
            kind: "agent",
            id: row.creatorAgentId,
            name:
              (row.creatorAgentId && names.get(row.creatorAgentId)) || "agent",
          },
    lastSpawnedItemId: row.lastSpawnedItemId,
    lastSpawnedAt: row.lastSpawnedAt?.toISOString() ?? null,
    spawnCount: row.spawnCount,
    skipCount: row.skipCount,
    lastSkip:
      row.lastSkipReason && row.lastSkipAt
        ? {
            reason: row.lastSkipReason,
            message: SKIP_TEXT[row.lastSkipReason as SkipReason] ?? "",
            at: row.lastSkipAt.toISOString(),
          }
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function namesFor(rows: readonly HubRecurrence[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.assigneeAgentId) ids.add(row.assigneeAgentId);
    if (row.creatorAgentId) ids.add(row.creatorAgentId);
  }
  const names = new Map<string, string>();
  if (!ids.size) return names;
  const agents = await prisma.hubAgent.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  });
  for (const agent of agents) names.set(agent.id, agent.name);
  return names;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * createItem with an optional `recurrence`. The item created now is the first
 * occurrence; later ones are opened by the worker. Everything is validated and
 * the Pro gate is checked before anything is written.
 */
export async function createItemWithRecurrence(
  scope: HubScope,
  input: CreateItemWithRecurrenceInput
) {
  const { recurrence, ...brief } = input;
  if (!recurrence) return createItem(scope, brief);

  await assertRecurrenceAllowed(scope.userId);
  const timezone =
    recurrence.timezone?.trim() || (await defaultTimeZone(scope.userId));
  const rrule = cleanRule(recurrence.rrule);
  assertRecurrence(rrule, timezone);
  const now = newDate();
  const next = nextOccurrence(rrule, timezone, now, now);
  const existing = await prisma.hubRecurrence.count({
    where: { userId: scope.userId },
  });
  if (existing >= RECURRENCE_MAX_PER_USER) {
    throw new HubError(
      "INVALID",
      `At most ${RECURRENCE_MAX_PER_USER} recurrences. Delete one you no longer need with needt_agent_recurrence_update.`,
      { field: "recurrence" }
    );
  }

  const hooks: CreateItemHooks = {
    afterCreate: async (tx, created) => {
      const made = await tx.hubRecurrence.create({
        data: {
          userId: created.userId,
          workspaceId: created.workspaceId,
          title: created.title,
          goal: created.goal,
          doneCriteria: created.doneCriteria,
          criteriaItems: created.criteriaItems,
          context: created.context,
          links: created.links ?? [],
          risks: created.risks,
          assigneeAgentId: created.assigneeAgentId,
          requiredSkills: created.requiredSkills,
          creatorKind: created.creatorKind,
          creatorAgentId: created.creatorAgentId,
          rrule,
          timezone,
          nextRunAt: next,
          active: next !== null,
          allowOverlap: recurrence.allowOverlap ?? false,
          lastSpawnedItemId: created.id,
          lastSpawnedAt: now,
          spawnCount: 1,
        },
      });
      return tx.hubItem.update({
        where: { id: created.id },
        data: { recurrenceId: made.id, occurrenceAt: now },
      });
    },
  };
  const result = await createItem(scope, brief, hooks);
  const recurrenceId = (result.item as { recurrenceId?: string | null })
    .recurrenceId;
  const row = recurrenceId
    ? await prisma.hubRecurrence.findUnique({ where: { id: recurrenceId } })
    : null;
  return {
    ...result,
    recurrence: row ? recurrenceView(row, await namesFor([row])) : null,
  };
}

// ---------------------------------------------------------------------------
// Read and change
// ---------------------------------------------------------------------------

function visible(row: HubRecurrence, actor: Actor) {
  return (
    actor.kind === "owner" ||
    row.creatorAgentId === actor.agent.id ||
    row.assigneeAgentId === actor.agent.id
  );
}

/** Recurrences the caller may see: the owner all, an agent those it made or is assigned. */
export async function listRecurrences(
  scope: HubScope,
  options: RecurrencesListInput = {}
) {
  const rows = await prisma.hubRecurrence.findMany({
    where: {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "desc" }],
    take: Math.min(options.limit ?? 50, 50) * 2,
  });
  const mine = rows
    .filter((row) => visible(row, scope.actor))
    .slice(0, options.limit ?? 50);
  const names = await namesFor(mine);
  return { recurrences: mine.map((row) => recurrenceView(row, names)) };
}

/** pause / resume / delete. An agent changes only the recurrences it created. */
export async function updateRecurrence(
  scope: HubScope,
  input: RecurrenceUpdateInput
) {
  const row = await prisma.hubRecurrence.findFirst({
    where: {
      id: input.id,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!row || !visible(row, scope.actor)) {
    throw new HubError("NOT_FOUND", "Recurrence not found.");
  }
  if (
    scope.actor.kind === "agent" &&
    row.creatorAgentId !== scope.actor.agent.id
  ) {
    throw new HubError(
      "FORBIDDEN",
      "You can change only recurrences you created."
    );
  }
  if (input.action === "delete") {
    await prisma.hubRecurrence.delete({ where: { id: row.id } });
    return { deleted: true, id: row.id };
  }
  if (input.action === "pause") {
    const updated = await prisma.hubRecurrence.update({
      where: { id: row.id },
      data: { active: false },
    });
    return { recurrence: recurrenceView(updated, await namesFor([updated])) };
  }
  await assertRecurrenceAllowed(scope.userId);
  const now = newDate();
  const next = nextOccurrence(row.rrule, row.timezone, now, row.createdAt);
  const updated = await prisma.hubRecurrence.update({
    where: { id: row.id },
    data: { active: next !== null, nextRunAt: next },
  });
  return { recurrence: recurrenceView(updated, await namesFor([updated])) };
}

/** The recurrence behind one item, for the owner's Repeats line. */
export async function recurrenceForItem(key: WorkspaceKey, id: string) {
  const row = await prisma.hubRecurrence.findFirst({
    where: { id, userId: key.userId, workspaceId: key.workspaceId },
  });
  return row ? recurrenceView(row, await namesFor([row])) : null;
}

// ---------------------------------------------------------------------------
// Spawn (worker)
// ---------------------------------------------------------------------------

export type SpawnOutcome =
  | { kind: "spawned"; itemId: string }
  | { kind: "skipped"; reason: SkipReason };

async function liveAgent(
  tx: Prisma.TransactionClient,
  id: string | null
): Promise<HubAgent | null> {
  if (!id) return null;
  const agent = await tx.hubAgent.findUnique({ where: { id } });
  return agent && !agent.disabledAt ? agent : null;
}

/**
 * Handles one due recurrence inside the transaction that holds its row lock:
 * decides spawn or skip, writes the item, and moves nextRunAt forward, all
 * together. The item carries (recurrenceId, occurrenceAt), unique in the
 * database, so a retry can never open the same occurrence twice.
 */
export async function processDueRecurrence(
  tx: Prisma.TransactionClient,
  rec: HubRecurrence,
  now: Date
): Promise<SpawnOutcome> {
  const occurrenceAt = rec.nextRunAt as Date;

  let next: Date | null;
  try {
    next = nextOccurrence(rec.rrule, rec.timezone, now, rec.createdAt);
  } catch {
    await tx.hubRecurrence.update({
      where: { id: rec.id },
      data: {
        active: false,
        nextRunAt: null,
        lastSkipReason: "invalid_rule",
        lastSkipAt: now,
        skipCount: { increment: 1 },
      },
    });
    return { kind: "skipped", reason: "invalid_rule" };
  }
  const advance = { nextRunAt: next, active: next !== null };

  const skip = async (reason: SkipReason): Promise<SpawnOutcome> => {
    await tx.hubRecurrence.update({
      where: { id: rec.id },
      data: {
        ...advance,
        lastSkipReason: reason,
        lastSkipAt: now,
        skipCount: { increment: 1 },
      },
    });
    return { kind: "skipped", reason };
  };

  if (!(await agentHubEnabled(rec.userId))) return skip("hub_disabled");
  if (!(await canUseHubRecurring(rec.userId)).allowed) return skip("plan");

  if (rec.assigneeAgentId && !(await liveAgent(tx, rec.assigneeAgentId))) {
    return skip("assignee_unavailable");
  }
  const creator = rec.creatorAgentId
    ? await liveAgent(tx, rec.creatorAgentId)
    : null;
  if (rec.creatorKind === "agent" && !creator) {
    return skip("creator_unavailable");
  }

  // Already opened (an earlier attempt of this same occurrence): just move on.
  const already = await tx.hubItem.findFirst({
    where: { recurrenceId: rec.id, occurrenceAt },
    select: { id: true },
  });
  if (already) {
    await tx.hubRecurrence.update({
      where: { id: rec.id },
      data: { ...advance, lastSpawnedItemId: already.id },
    });
    return { kind: "spawned", itemId: already.id };
  }

  if (!rec.allowOverlap) {
    const open = await tx.hubItem.findFirst({
      where: {
        recurrenceId: rec.id,
        status: { notIn: [...TERMINAL_STATUSES] },
      },
      select: { id: true },
    });
    if (open) return skip("previous_open");
  }

  const actor: Actor = creator
    ? { kind: "agent", agent: creator }
    : { kind: "owner" };
  try {
    await assertHubLimitFor(rec.userId, actor, "items");
  } catch (error) {
    if (error instanceof HubError && error.code === "PLAN_LIMIT") {
      return skip("plan_limit");
    }
    throw error;
  }

  const item = await tx.hubItem.create({
    data: {
      userId: rec.userId,
      workspaceId: rec.workspaceId,
      title: rec.title,
      goal: rec.goal,
      doneCriteria: rec.doneCriteria,
      criteriaItems: rec.criteriaItems,
      context: rec.context,
      links: rec.links ?? [],
      risks: rec.risks,
      status: "open",
      assigneeAgentId: rec.assigneeAgentId,
      requiredSkills: rec.requiredSkills,
      creatorKind: rec.creatorKind,
      creatorAgentId: rec.creatorAgentId,
      clientRef: `recurrence:${rec.id}:${occurrenceAt.toISOString()}`,
      recurrenceId: rec.id,
      occurrenceAt,
    },
  });
  await writeEvents(
    tx,
    item.id,
    undefined,
    [
      {
        type: "created",
        to: "open",
        actor: "system",
        message: `Opened by the recurrence "${describeRule(rec.rrule, rec.timezone)}" for ${occurrenceAt.toISOString()}.`,
        data: {
          recurrenceId: rec.id,
          occurrenceAt: occurrenceAt.toISOString(),
        },
      },
    ],
    now
  );
  await tx.hubRecurrence.update({
    where: { id: rec.id },
    data: {
      ...advance,
      lastSpawnedItemId: item.id,
      lastSpawnedAt: now,
      spawnCount: { increment: 1 },
      lastSkipReason: null,
      lastSkipAt: null,
    },
  });
  trackHub({
    name: "hub_item_created",
    itemId: item.id,
    creator: rec.creatorKind === "agent" ? "agent" : "owner",
  });
  return { kind: "spawned", itemId: item.id };
}

/**
 * One worker sweep: opens an item for every due recurrence (up to a batch).
 * Rows are taken with FOR UPDATE SKIP LOCKED, one per transaction, so two
 * workers never process the same row and a crash rolls the row back whole.
 */
export async function spawnDueRecurrences(now: Date = newDate()) {
  let spawned = 0;
  let skipped = 0;
  for (let handled = 0; handled < RECURRENCE_SWEEP_BATCH; handled += 1) {
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "HubRecurrence"
        WHERE "active" = true AND "nextRunAt" IS NOT NULL AND "nextRunAt" <= ${now}
        ORDER BY "nextRunAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return null;
      const rec = await tx.hubRecurrence.findUnique({
        where: { id: rows[0].id },
      });
      if (!rec || !rec.nextRunAt) return null;
      return processDueRecurrence(tx, rec, now);
    });
    if (!outcome) break;
    if (outcome.kind === "spawned") spawned += 1;
    else skipped += 1;
  }
  if (spawned || skipped) {
    await logger.info(
      "Hub recurrences swept",
      { spawned, skipped },
      LOG_SOURCE
    );
  }
  return { spawned, skipped };
}
