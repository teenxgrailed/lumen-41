import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import {
  deleteWebhook,
  updateWebhook,
  webhookUpdateInput,
} from "@/services/agent-hub/webhooks";

type Params = { params: Promise<{ id: string }> };

/** Change the URL or events, or switch a webhook on or off. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, webhookUpdateInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await updateWebhook(auth.scope, id, body.data));
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await deleteWebhook(auth.scope, id));
  });
}
