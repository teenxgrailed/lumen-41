import type { HubAgent, HubItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { HELD_STATUSES } from "./constants";
import { HubError } from "./errors";

/**
 * Per-agent workload limits (owner decision 2026-11-03: Grok Bot agents share
 * one weekly usage budget, so the hub throttles what each may take). Stored as
 * one nullable Json column on HubAgent and written only by the owner. No limits
 * (null, or a key left out) means unlimited, so existing agents are unchanged.
 */

export const agentLimitsSchema = z
  .object({
    maxInProgress: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .optional()
      .describe("Most items held (claimed, working or blocked) at once."),
    maxClaimsPerDay: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .nullable()
      .optional()
      .describe("Most new claims per UTC day; the rest stay queued."),
    inboxLimit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .nullable()
      .optional()
      .describe("Inbox and next show at most this many open items."),
    acceptsLarge: z
      .boolean()
      .optional()
      .describe(
        "false: items flagged large are not offered unless the owner approved them."
      ),
  })
  .strict();
export type AgentLimitsInput = z.infer<typeof agentLimitsSchema>;

export interface AgentLimits {
  maxInProgress: number | null;
  maxClaimsPerDay: number | null;
  inboxLimit: number | null;
  acceptsLarge: boolean;
}

export const NO_LIMITS: AgentLimits = {
  maxInProgress: null,
  maxClaimsPerDay: null,
  inboxLimit: null,
  acceptsLarge: true,
};

/** Reads the stored column defensively: anything malformed counts as no limit. */
export function agentLimits(agent: Pick<HubAgent, "limits">): AgentLimits {
  const parsed = agentLimitsSchema.safeParse(agent.limits ?? {});
  if (!parsed.success) return NO_LIMITS;
  return {
    maxInProgress: parsed.data.maxInProgress ?? null,
    maxClaimsPerDay: parsed.data.maxClaimsPerDay ?? null,
    inboxLimit: parsed.data.inboxLimit ?? null,
    acceptsLarge: parsed.data.acceptsLarge ?? true,
  };
}

export function hasLimits(limits: AgentLimits) {
  return (
    limits.maxInProgress !== null ||
    limits.maxClaimsPerDay !== null ||
    limits.inboxLimit !== null ||
    !limits.acceptsLarge
  );
}

/** What the owner stores: only the keys that are set. Null when nothing is. */
export function limitsColumn(
  input: AgentLimitsInput | null
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!input) return Prisma.DbNull;
  const out: Record<string, number | boolean> = {};
  if (input.maxInProgress != null) out.maxInProgress = input.maxInProgress;
  if (input.maxClaimsPerDay != null) {
    out.maxClaimsPerDay = input.maxClaimsPerDay;
  }
  if (input.inboxLimit != null) out.inboxLimit = input.inboxLimit;
  if (input.acceptsLarge === false) out.acceptsLarge = false;
  return Object.keys(out).length ? out : Prisma.DbNull;
}

/** Start of the current UTC day: the claim counter resets at 00:00 UTC. */
export function dayStart(now: Date = newDate()) {
  return newDate(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the owner has not blocked this agent from taking `item`. */
export function offersItem(
  item: Pick<HubItem, "large" | "largeApprovedAt">,
  limits: AgentLimits
) {
  return limits.acceptsLarge || !item.large || Boolean(item.largeApprovedAt);
}

/** Drops the items an agent that does not accept large work must not see. */
export function withoutBlockedLarge<
  T extends Pick<HubItem, "large" | "largeApprovedAt">,
>(items: readonly T[], limits: AgentLimits): T[] {
  return limits.acceptsLarge
    ? [...items]
    : items.filter((item) => offersItem(item, limits));
}

export interface WorkloadGate {
  /** null: the agent may take another item. */
  blocked: null | {
    scope: "in_progress" | "daily";
    limit: number;
    used: number;
    retryAfterSeconds: number | null;
    message: string;
  };
}

/**
 * Items the agent holds right now. An item whose lease has run out does not
 * count: others may take it over, and a dead bot must not fill its own cap.
 */
export function heldCount(agentId: string, now: Date = newDate()) {
  return prisma.hubItem.count({
    where: {
      claimedByAgentId: agentId,
      status: { in: [...HELD_STATUSES] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { gte: now } }],
    },
  });
}

/** Fresh claims the agent made since 00:00 UTC (a holder's re-claim does not count). */
export function claimsToday(agentId: string, now: Date = newDate()) {
  return prisma.hubItemEvent.count({
    where: {
      actorKind: "agent",
      actorAgentId: agentId,
      type: "claimed",
      at: { gte: dayStart(now) },
      data: { path: ["fresh"], equals: true },
    },
  });
}

/**
 * Whether the agent may take one more item. Does no query for an agent with no
 * caps, so unlimited agents cost nothing.
 */
export async function workloadGate(
  agent: HubAgent,
  now: Date = newDate()
): Promise<WorkloadGate> {
  const limits = agentLimits(agent);
  if (limits.maxInProgress !== null) {
    const used = await heldCount(agent.id, now);
    if (used >= limits.maxInProgress) {
      return {
        blocked: {
          scope: "in_progress",
          limit: limits.maxInProgress,
          used,
          retryAfterSeconds: null,
          message: `You already hold ${used} of ${limits.maxInProgress} items the owner allows at once. Finish or release one with needt_agent_task_complete or needt_agent_release, then claim again.`,
        },
      };
    }
  }
  if (limits.maxClaimsPerDay !== null) {
    const used = await claimsToday(agent.id, now);
    if (used >= limits.maxClaimsPerDay) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((dayStart(now).getTime() + DAY_MS - now.getTime()) / 1000)
      );
      return {
        blocked: {
          scope: "daily",
          limit: limits.maxClaimsPerDay,
          used,
          retryAfterSeconds,
          message: `You reached the daily limit of ${limits.maxClaimsPerDay} claims set by the owner. Queued items stay for you; try again after 00:00 UTC.`,
        },
      };
    }
  }
  return { blocked: null };
}

/** Throws AGENT_LIMIT (429, retryable) when the agent is at a cap. */
export async function assertWorkloadRoom(agent: HubAgent) {
  const { blocked } = await workloadGate(agent);
  if (!blocked) return;
  throw new HubError("AGENT_LIMIT", blocked.message, {
    limit: blocked.limit,
    used: blocked.used,
    scope: blocked.scope,
    retryable: true,
    ...(blocked.retryAfterSeconds
      ? { retryAfterSeconds: blocked.retryAfterSeconds }
      : {}),
  });
}

/** What an agent may read about its own limits (it cannot change them). */
export function limitsView(agent: Pick<HubAgent, "limits">) {
  const limits = agentLimits(agent);
  return hasLimits(limits) ? limits : null;
}
