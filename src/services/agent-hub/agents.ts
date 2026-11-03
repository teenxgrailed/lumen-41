import type { HubAgent } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  type AgentLimitsInput,
  limitsColumn,
  limitsView,
} from "./agent-limits";
import { ASSISTANT_CONNECTION_KEY, HELD_STATUSES } from "./constants";
import type { AgentScope, HubScope, WorkspaceKey } from "./context";
import { HubError } from "./errors";
import { assertHubLimit } from "./limits";
import { type RegisterInput, normalizeTags } from "./schemas";
import { assertNoSecrets } from "./secret-scan";

export function agentView(agent: HubAgent) {
  return {
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    capabilities: agent.capabilities,
    skills: agent.skills,
    lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
    disabled: Boolean(agent.disabledAt),
  };
}

function profilePatch(input: RegisterInput) {
  assertNoSecrets({
    name: input.name,
    capabilities: input.capabilities,
    skills: input.skills,
  });
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.capabilities !== undefined
      ? { capabilities: input.capabilities.trim() }
      : {}),
    ...(input.skills !== undefined
      ? { skills: normalizeTags(input.skills) }
      : {}),
  };
}

/**
 * One token, one agent. A token is one agent's identity, so a second client
 * that registers through it under another name or kind would silently take
 * over the first one's profile, items and leases. An agent counts as
 * registered once a client gave it a kind, capabilities or skills; a register
 * that names a different name or kind than that is refused. The same client
 * registering again (same name and kind, or neither) stays idempotent, and a
 * token whose agent still has its defaults is free to claim its identity.
 * Rename or re-kind an agent from the Agents screen instead.
 */
export function assertTokenNotInUse(self: HubAgent, input: RegisterInput) {
  const registered =
    self.kind !== "other" ||
    self.capabilities.trim() !== "" ||
    self.skills.length > 0;
  if (!registered) return;
  const otherName =
    input.name !== undefined &&
    input.name.trim().toLowerCase() !== self.name.trim().toLowerCase();
  const otherKind = input.kind !== undefined && input.kind !== self.kind;
  if (!otherName && !otherKind) return;
  throw new HubError(
    "TOKEN_IN_USE",
    `This token already belongs to agent ${self.name}. Create a separate token for each agent in Settings > Connections.`,
    { agent: self.name, kind: self.kind }
  );
}

/** An agent describes itself. Idempotent; another agent's id is refused. */
export async function registerAgent(scope: AgentScope, input: RegisterInput) {
  const self = scope.actor.agent;
  if (input.agentId && input.agentId !== self.id) {
    throw new HubError(
      "FORBIDDEN",
      "An agent can change only its own profile. Ask the owner to edit another agent."
    );
  }
  assertTokenNotInUse(self, input);
  const patch = profilePatch(input);
  if (input.name !== undefined && !patch.name) {
    throw new HubError("INVALID", "name cannot be empty.");
  }
  const agent = Object.keys(patch).length
    ? await prisma.hubAgent.update({ where: { id: self.id }, data: patch })
    : self;
  return { ...agentView(agent), limits: limitsView(agent), self: true };
}

/** The owner edits any agent's profile (or disables it). */
export async function ownerUpdateAgent(
  scope: HubScope,
  agentId: string,
  input: RegisterInput & {
    disabled?: boolean;
    /** Owner only: undefined keeps the limits, null clears them. */
    limits?: AgentLimitsInput | null;
  }
) {
  if (scope.actor.kind !== "owner") {
    throw new HubError("FORBIDDEN", "Only the owner can edit another agent.");
  }
  const existing = await prisma.hubAgent.findFirst({
    where: {
      id: agentId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    },
  });
  if (!existing) throw new HubError("NOT_FOUND", "Agent not found.");
  const patch = profilePatch(input);
  // Turning a disabled agent back on takes a slot again, so it is gated like a
  // new agent. The assistant never counts and is never blocked.
  if (
    input.disabled === false &&
    existing.disabledAt &&
    existing.connectionKey !== ASSISTANT_CONNECTION_KEY
  ) {
    await assertHubLimit(scope.userId, "agents");
  }
  const agent = await prisma.hubAgent.update({
    where: { id: existing.id },
    data: {
      ...patch,
      ...(input.disabled !== undefined
        ? { disabledAt: input.disabled ? newDate() : null }
        : {}),
      ...(input.limits !== undefined
        ? { limits: limitsColumn(input.limits) }
        : {}),
    },
  });
  return { ...agentView(agent), limits: limitsView(agent) };
}

async function itemCounts(key: WorkspaceKey) {
  const grouped = await prisma.hubItem.groupBy({
    by: ["assigneeAgentId", "claimedByAgentId", "status"],
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      status: { in: ["open", ...HELD_STATUSES] },
    },
    _count: { _all: true },
  });
  const open = new Map<string, number>();
  const held = new Map<string, number>();
  for (const row of grouped) {
    if (row.status === "open" && row.assigneeAgentId) {
      open.set(
        row.assigneeAgentId,
        (open.get(row.assigneeAgentId) ?? 0) + row._count._all
      );
    }
    if (row.claimedByAgentId && HELD_STATUSES.includes(row.status)) {
      held.set(
        row.claimedByAgentId,
        (held.get(row.claimedByAgentId) ?? 0) + row._count._all
      );
    }
  }
  return { open, held };
}

/** Every agent in the workspace; token hashes and previews are never included. */
export async function listAgents(key: WorkspaceKey, selfId?: string) {
  const [agents, counts] = await Promise.all([
    prisma.hubAgent.findMany({
      where: { userId: key.userId, workspaceId: key.workspaceId },
      orderBy: [{ createdAt: "asc" }],
    }),
    itemCounts(key),
  ]);
  return agents.map((agent) => ({
    ...agentView(agent),
    self: agent.id === selfId,
    openItems: counts.open.get(agent.id) ?? 0,
    heldItems: counts.held.get(agent.id) ?? 0,
  }));
}

/** The owner's view: adds the connection kind and the token's state. */
export async function listAgentsForOwner(key: WorkspaceKey) {
  const [agents, counts] = await Promise.all([
    prisma.hubAgent.findMany({
      where: { userId: key.userId, workspaceId: key.workspaceId },
      orderBy: [{ createdAt: "asc" }],
      include: { token: true },
    }),
    itemCounts(key),
  ]);
  return agents.map((agent) => ({
    ...agentView(agent),
    limits: limitsView(agent),
    self: false,
    openItems: counts.open.get(agent.id) ?? 0,
    heldItems: counts.held.get(agent.id) ?? 0,
    connection: agent.connectionKey.startsWith("token:")
      ? "agent token"
      : agent.connectionKey.startsWith("oauth:")
        ? "OAuth app"
        : agent.connectionKey === "assistant"
          ? "Needt assistant"
          : "personal token",
    sharesPersonalToken: agent.connectionKey === "personal",
    token: agent.token
      ? {
          preview: agent.token.tokenPreview,
          scopes: agent.token.scopes,
          lastUsedAt: agent.token.lastUsedAt?.toISOString() ?? null,
          expiresAt: agent.token.expiresAt?.toISOString() ?? null,
          revoked: Boolean(agent.token.revokedAt),
        }
      : null,
  }));
}

/** Resolves an agent by id, else by case-insensitive name; null if unknown. */
export async function findAgentByRef(key: WorkspaceKey, ref: string) {
  const byId = await prisma.hubAgent.findFirst({
    where: { id: ref, userId: key.userId, workspaceId: key.workspaceId },
  });
  if (byId) return byId;
  const byName = await prisma.hubAgent.findMany({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      name: { equals: ref.trim(), mode: "insensitive" },
    },
    take: 2,
  });
  if (byName.length > 1) {
    throw new HubError(
      "INVALID",
      `More than one agent is named "${ref}". Use the agent id from needt_agents_list.`
    );
  }
  return byName[0] ?? null;
}
