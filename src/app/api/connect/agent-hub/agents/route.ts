import { NextRequest, NextResponse } from "next/server";

import { listAgents, registerAgent } from "@/services/agent-hub/agents";
import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { registerInput } from "@/services/agent-hub/schemas";

/** Agents in the workspace; the row with `self: true` is the caller. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const agents = await listAgents(auth.scope, auth.scope.actor.agent.id);
    return NextResponse.json({ agents });
  });
}

/** The caller sets its own name, kind, capabilities and skills. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, registerInput);
    if ("response" in body) return body.response;
    return NextResponse.json({
      agent: await registerAgent(auth.scope, body.data),
    });
  });
}
