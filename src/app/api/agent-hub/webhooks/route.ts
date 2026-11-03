import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import {
  createWebhook,
  listWebhooks,
  webhookCreateInput,
} from "@/services/agent-hub/webhooks";

/** The owner's webhooks and whether the plan has them. The secret is never listed. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    return NextResponse.json(await listWebhooks(auth.scope));
  });
}

/** Adds a webhook (Pro). The signing secret is in this answer only. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, webhookCreateInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await createWebhook(auth.scope, body.data), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
