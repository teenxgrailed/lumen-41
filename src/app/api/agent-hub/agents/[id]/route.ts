import { NextRequest, NextResponse } from "next/server";

import { agentLimitsSchema } from "@/services/agent-hub/agent-limits";
import { ownerUpdateAgent } from "@/services/agent-hub/agents";
import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { registerInput } from "@/services/agent-hub/schemas";
import { revokeAgentToken } from "@/services/agent-hub/tokens";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

// `limits` is owner-only: registerInput (what agents send) has no such field.
// null clears every limit; leaving it out keeps them.
const patchInput = registerInput.extend({
  disabled: z.boolean().optional(),
  limits: agentLimitsSchema.nullable().optional(),
});

/** The owner edits any agent's profile, workload limits, or disables it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, patchInput);
    if ("response" in body) return body.response;
    return NextResponse.json({
      agent: await ownerUpdateAgent(auth.scope, id, body.data),
    });
  });
}

/** Revokes the agent's token at once (the agent and its history stay). */
export async function DELETE(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await revokeAgentToken(auth.scope, id));
  });
}
