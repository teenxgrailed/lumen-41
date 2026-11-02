import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { claimItem } from "@/services/agent-hub/items";
import { claimInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** Take the item for a lease. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, claimInput.omit({ id: true }));
    if ("response" in body) return body.response;
    return NextResponse.json(await claimItem(auth.scope, { ...body.data, id }));
  });
}
