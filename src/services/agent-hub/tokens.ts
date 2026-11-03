import { hashConnectorToken } from "@/services/connectors/auth-tokens";
import type { BearerAuth } from "@/services/connectors/bearer";
import crypto from "crypto";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import type { McpScope } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

import { AGENT_TOKEN_PREFIX, HUB_SCOPE, type HubKind } from "./constants";
import type { HubScope } from "./context";
import { HubError } from "./errors";
import { assertHubLimit } from "./limits";

const LAST_USED_WRITE_MS = 60 * 1000;

/** Extra scopes the owner may tick for an agent token; the hub scope is always on. */
export const AGENT_TOKEN_EXTRA_SCOPES: readonly McpScope[] = [
  "needt.read",
  "needt.write",
];

export function generateAgentToken() {
  return `${AGENT_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export function agentTokenPreview(token: string) {
  return `${token.slice(0, AGENT_TOKEN_PREFIX.length + 4)}…${token.slice(-4)}`;
}

/** Registered with `registerBearerResolver` (see `register.ts`). */
export async function resolveAgentToken(
  token: string
): Promise<BearerAuth | null> {
  if (!token.startsWith(AGENT_TOKEN_PREFIX)) return null;
  const stored = await prisma.hubAgentToken.findUnique({
    where: { tokenHash: hashConnectorToken(token) },
    include: { agent: { select: { userId: true, disabledAt: true } } },
  });
  const now = newDate();
  if (
    !stored ||
    stored.revokedAt ||
    (stored.expiresAt && stored.expiresAt.getTime() <= now.getTime()) ||
    stored.agent.disabledAt
  ) {
    return null;
  }
  if (
    !stored.lastUsedAt ||
    now.getTime() - stored.lastUsedAt.getTime() > LAST_USED_WRITE_MS
  ) {
    await prisma.hubAgentToken.update({
      where: { id: stored.id },
      data: { lastUsedAt: now },
    });
  }
  return {
    userId: stored.agent.userId,
    kind: "agent",
    scopes: stored.scopes as McpScope[],
    workspaceId: stored.workspaceId,
    agentTokenId: stored.id,
  };
}

export interface CreateAgentTokenInput {
  name: string;
  kind?: HubKind;
  extraScopes?: readonly string[];
  expiresInDays?: number;
}

/**
 * Makes an agent and its token in one step. The full token is returned once;
 * only its sha256 and a preview are stored.
 */
export async function createAgentToken(
  scope: HubScope,
  input: CreateAgentTokenInput
) {
  if (scope.actor.kind !== "owner") {
    throw new HubError("FORBIDDEN", "Only the owner can create agent tokens.");
  }
  const name = input.name.trim();
  if (!name || name.length > 60) {
    throw new HubError("INVALID", "name must be 1 to 60 characters.");
  }
  const extra = [...new Set(input.extraScopes ?? [])];
  for (const entry of extra) {
    if (!(AGENT_TOKEN_EXTRA_SCOPES as readonly string[]).includes(entry)) {
      throw new HubError(
        "INVALID",
        `Scope ${entry} cannot be added to an agent token (allowed: ${AGENT_TOKEN_EXTRA_SCOPES.join(", ")}).`
      );
    }
  }
  const scopes: string[] = [HUB_SCOPE, ...extra];
  const now = newDate();
  const days = input.expiresInDays;
  if (
    days !== undefined &&
    (!Number.isInteger(days) || days < 1 || days > 730)
  ) {
    throw new HubError("INVALID", "expiresInDays must be 1 to 730.");
  }
  await assertHubLimit(scope.userId, "agents");
  const tokenId = crypto.randomUUID();
  const token = generateAgentToken();
  const agent = await prisma.hubAgent.create({
    data: {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      connectionKey: `token:${tokenId}`,
      name,
      kind: input.kind ?? "other",
      capabilities: "",
      skills: [],
      token: {
        create: {
          id: tokenId,
          tokenHash: hashConnectorToken(token),
          tokenPreview: agentTokenPreview(token),
          scopes,
          workspaceId: scope.workspaceId,
          expiresAt: days ? addCalendarDays(now, days) : null,
        },
      },
    },
    include: { token: true },
  });
  return {
    token,
    agent: {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      scopes,
      tokenPreview: agent.token?.tokenPreview ?? null,
      expiresAt: agent.token?.expiresAt?.toISOString() ?? null,
    },
  };
}

/** Revokes the agent's token at once; the agent row and its history stay. */
export async function revokeAgentToken(scope: HubScope, agentId: string) {
  if (scope.actor.kind !== "owner") {
    throw new HubError("FORBIDDEN", "Only the owner can revoke agent tokens.");
  }
  const token = await prisma.hubAgentToken.findFirst({
    where: {
      agentId,
      agent: { userId: scope.userId, workspaceId: scope.workspaceId },
    },
    select: { id: true, revokedAt: true },
  });
  if (!token) throw new HubError("NOT_FOUND", "Agent token not found.");
  const now = newDate();
  // The agent is disabled with its token, in the same transaction, so a
  // revoked token frees its plan slot. Disabling is idempotent.
  await prisma.$transaction([
    ...(token.revokedAt
      ? []
      : [
          prisma.hubAgentToken.update({
            where: { id: token.id },
            data: { revokedAt: now },
          }),
        ]),
    prisma.hubAgent.updateMany({
      where: { id: agentId, disabledAt: null },
      data: { disabledAt: now },
    }),
  ]);
  return { revoked: true };
}
