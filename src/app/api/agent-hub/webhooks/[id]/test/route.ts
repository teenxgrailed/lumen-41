import { NextRequest, NextResponse } from "next/server";

import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";
import { sendTestEvent } from "@/services/agent-hub/webhooks";

type Params = { params: Promise<{ id: string }> };

/** Queues a `webhook.test` delivery to this webhook. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await sendTestEvent(auth.scope, id), {
      status: 202,
    });
  });
}
