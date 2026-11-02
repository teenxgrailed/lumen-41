import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { getItem, updateItem } from "@/services/agent-hub/items";
import { updateInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await getItem(auth.scope, id));
  });
}

/** Progress, blocked, or a heartbeat on an item the caller holds. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, updateInput.omit({ id: true }));
    if ("response" in body) return body.response;
    return NextResponse.json(
      await updateItem(auth.scope, { ...body.data, id })
    );
  });
}
