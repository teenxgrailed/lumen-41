import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { escalateItem } from "@/services/agent-hub/items";
import { escalateInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** Ask the owner; creates one owner task. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, escalateInput.omit({ id: true }));
    if ("response" in body) return body.response;
    return NextResponse.json(
      await escalateItem(auth.scope, { ...body.data, id })
    );
  });
}
