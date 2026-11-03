import { NextRequest, NextResponse } from "next/server";

import { authenticateHubAgent, hubRoute } from "@/services/agent-hub/http";
import { listDeliveries } from "@/services/agent-hub/webhooks";

type Params = { params: Promise<{ id: string }> };

/** The last 20 deliveries of one webhook, newest first. */
export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await listDeliveries(auth.scope, id));
  });
}
