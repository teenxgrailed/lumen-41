import type { NextRequest } from "next/server";

import { authorizeConnectorWorkspace } from "@/services/connectors/auth";
import type { BearerAuth } from "@/services/connectors/bearer";
import { WorkspaceRole } from "@prisma/client";
import type { HubAgent } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { agentHubEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { HubError } from "./errors";

/** Who is acting: an agent behind one connection, or the signed-in owner. */
export type Actor = { kind: "agent"; agent: HubAgent } | { kind: "owner" };

export interface HubScope {
  userId: string;
  workspaceId: string;
  actor: Actor;
}
export interface AgentScope extends HubScope {
  actor: { kind: "agent"; agent: HubAgent };
}

/** The workspace-only part of a scope, for work done on nobody's behalf. */
export type WorkspaceKey = Pick<HubScope, "userId" | "workspaceId">;

const LAST_SEEN_WRITE_MS = 60 * 1000;

export function connectionKeyOf(auth: BearerAuth): string {
  if (auth.kind === "agent" && auth.agentTokenId) {
    return `token:${auth.agentTokenId}`;
  }
  if (auth.kind === "oauth" && auth.clientId) return `oauth:${auth.clientId}`;
  if (auth.kind === "personal" && auth.personalTokenId) {
    return `token:${auth.personalTokenId}`;
  }
  return "personal";
}

async function defaultAgentName(auth: BearerAuth): Promise<string> {
  if (auth.kind === "oauth" && auth.clientId) {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId: auth.clientId },
      select: { name: true },
    });
    if (client?.name.trim()) return client.name.trim().slice(0, 60);
  }
  if (auth.kind === "personal" && auth.personalTokenName?.trim()) {
    return auth.personalTokenName.trim().slice(0, 60);
  }
  if (auth.kind === "agent") return "Agent";
  return auth.kind === "oauth" ? "OAuth client" : "Personal token";
}

/** The agent behind a connection, created on its first call. */
export async function agentForConnection(
  auth: BearerAuth,
  workspaceId: string
): Promise<HubAgent> {
  const connectionKey = connectionKeyOf(auth);
  const where = {
    userId_workspaceId_connectionKey: {
      userId: auth.userId,
      workspaceId,
      connectionKey,
    },
  };
  let agent = await prisma.hubAgent.findUnique({ where });
  if (!agent) {
    try {
      agent = await prisma.hubAgent.create({
        data: {
          userId: auth.userId,
          workspaceId,
          connectionKey,
          name: await defaultAgentName(auth),
          kind: "other",
          capabilities: "",
          skills: [],
          lastSeenAt: newDate(),
        },
      });
    } catch (error) {
      // Two first calls at once: the loser reads the winner's row.
      agent = await prisma.hubAgent.findUnique({ where });
      if (!agent) throw error;
    }
    return agent;
  }
  if (agent.disabledAt) {
    throw new HubError("FORBIDDEN", "This agent is disabled by the owner.");
  }
  const now = newDate();
  if (
    !agent.lastSeenAt ||
    now.getTime() - agent.lastSeenAt.getTime() > LAST_SEEN_WRITE_MS
  ) {
    agent = await prisma.hubAgent.update({
      where: { id: agent.id },
      data: { lastSeenAt: now },
    });
  }
  return agent;
}

/**
 * Whether a connection may use the hub at all: the hub scope, or the
 * ordinary read (for reads) or write (for writes) scope of a personal or OAuth
 * connection.
 */
export function hubScopesFor(auth: BearerAuth, write: boolean) {
  if (auth.scopes.includes("agents.hub")) return ["agents.hub"] as const;
  return write ? (["needt.write"] as const) : (["needt.read"] as const);
}

export function hasHubAccess(auth: BearerAuth, write: boolean): boolean {
  return hubScopesFor(auth, write).every((scope) =>
    auth.scopes.includes(scope)
  );
}

export async function assertHubEnabled(userId: string) {
  if (!(await agentHubEnabled(userId))) {
    throw new HubError("NOT_FOUND", "Not found");
  }
}

/**
 * The scope for an authenticated agent call. Flag first (a person without it
 * leaves no trace), then the workspace the connection is bound to, then the
 * agent record.
 */
export async function resolveAgentScope(input: {
  request: NextRequest;
  auth: BearerAuth;
  workspaceId?: string;
  write: boolean;
}): Promise<AgentScope> {
  const { request, auth } = input;
  await assertHubEnabled(auth.userId);
  const access = await authorizeConnectorWorkspace(
    request,
    auth.userId,
    input.write ? WorkspaceRole.EDITOR : WorkspaceRole.VIEWER,
    { workspaceId: input.workspaceId, boundWorkspaceId: auth.workspaceId }
  );
  if (access.response) {
    const body = (await access.response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new HubError(
      access.response.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
      body?.error ?? "Workspace access denied.",
      undefined,
      access.response.status
    );
  }
  const workspaceId = access.workspace.workspaceId;
  const agent = await agentForConnection(auth, workspaceId);
  return {
    userId: auth.userId,
    workspaceId,
    actor: { kind: "agent", agent },
  };
}

export function actorAgentId(actor: Actor): string | null {
  return actor.kind === "agent" ? actor.agent.id : null;
}
