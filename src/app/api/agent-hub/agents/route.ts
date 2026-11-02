import { NextRequest, NextResponse } from "next/server";

import { HUB_KINDS } from "@/services/agent-hub/constants";
import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { createAgentToken } from "@/services/agent-hub/tokens";
import { z } from "zod";

const createTokenInput = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(HUB_KINDS).optional(),
  extraScopes: z.array(z.string()).max(4).optional(),
  expiresInDays: z.number().int().min(1).max(730).optional(),
});

/** The owner makes a named agent and its token; the token is shown once. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, createTokenInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await createAgentToken(auth.scope, body.data), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
