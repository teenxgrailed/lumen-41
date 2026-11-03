import { NextRequest, NextResponse } from "next/server";

import "@/services/agent-hub/register";
import {
  authenticateBearer,
  insufficientScopeResponse,
} from "@/services/connectors/bearer";
import { WorkspaceRole } from "@prisma/client";
import type { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { bearerChallenge } from "@/lib/mcp-config";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

import {
  type AgentScope,
  type HubScope,
  assertHubEnabled,
  hasHubAccess,
  hubScopesFor,
  resolveAgentScope,
} from "./context";
import { HubError } from "./errors";

const OWNER_LOG_SOURCE = "agent-hub-owner";
/** The same ceiling as other /api/connect/* writes (and /api/mcp). */
const HUB_WRITE_LIMIT_PER_MINUTE = 30;

export function hubErrorResponse(error: unknown): NextResponse {
  if (error instanceof HubError) {
    const retryAfter = error.extra?.retryAfterSeconds;
    return NextResponse.json(error.body(), {
      status: error.status,
      ...(typeof retryAfter === "number"
        ? { headers: { "Retry-After": String(retryAfter) } }
        : {}),
    });
  }
  throw error;
}

/** Runs a handler and turns a HubError into its HTTP answer. */
export async function hubRoute(
  work: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await work();
  } catch (error) {
    return hubErrorResponse(error);
  }
}

/**
 * Bearer authentication for `/api/connect/agent-hub/*`: any token kind that
 * may use the hub (an agent token, or a personal / OAuth token with the
 * ordinary read or write scope). The flag is checked before the scope, so an
 * account without it gets 404 and leaves no trace.
 */
export async function authenticateHubAgent(
  request: NextRequest,
  write: boolean
): Promise<{ scope: AgentScope } | { response: NextResponse }> {
  const bearer = await authenticateBearer(request);
  if (!bearer) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "WWW-Authenticate": bearerChallenge() } }
      ),
    };
  }
  await assertHubEnabled(bearer.userId);
  if (!hasHubAccess(bearer, write)) {
    return {
      response: insufficientScopeResponse([...hubScopesFor(bearer, write)]),
    };
  }
  if (write) {
    const limited = await enforceRateLimits(
      [
        accountRule(
          bearer.userId,
          "connect:write",
          HUB_WRITE_LIMIT_PER_MINUTE,
          60
        ),
      ],
      { route: new URL(request.url).pathname, userId: bearer.userId }
    );
    if (limited) return { response: limited };
  }
  const scope = await resolveAgentScope({ request, auth: bearer, write });
  return { scope };
}

/**
 * Session authentication for the owner's own calls (the Agents screen and
 * owner REST). A bearer token of any kind is never an owner: Claude Code on
 * the personal token is an agent here, and an agent cannot approve its own
 * risky work.
 */
export async function authenticateHubOwner(
  request: NextRequest,
  write: boolean
): Promise<{ scope: HubScope } | { response: NextResponse }> {
  const auth = await authenticateRequest(request, OWNER_LOG_SOURCE, {
    requiredRole: write ? WorkspaceRole.EDITOR : WorkspaceRole.VIEWER,
  });
  if (auth.response) return { response: auth.response };
  await assertHubEnabled(auth.userId);
  if (!auth.workspace) {
    return {
      response: NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      ),
    };
  }
  return {
    scope: {
      userId: auth.userId,
      workspaceId: auth.workspace.workspaceId,
      actor: { kind: "owner" },
    },
  };
}

/** Parses a JSON body with a zod schema; a bad body is a 400 naming the fields. */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  const raw = (await request.json().catch(() => null)) ?? {};
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        {
          status: 400,
          error: "INVALID",
          message: "Invalid arguments",
          issues: parsed.error.issues,
        },
        { status: 400 }
      ),
    };
  }
  return { data: parsed.data };
}

export function queryOf(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const number = (name: string) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) && params.get(name) ? value : undefined;
  };
  return { params, number };
}
