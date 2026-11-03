import { NextRequest, NextResponse } from "next/server";

import { authenticateHubAgent, hubRoute } from "@/services/agent-hub/http";
import { listWebhooks } from "@/services/agent-hub/webhooks";

/**
 * Read-only: the workspace's webhooks (no secrets). Creating, changing and
 * removing them is the owner's, in the Agents screen or the session REST API.
 */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    return NextResponse.json(await listWebhooks(auth.scope));
  });
}
