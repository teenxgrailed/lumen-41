import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { cancelItem } from "@/services/agent-hub/items";
import { cancelInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** Withdraw an unfinished item the caller created. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, cancelInput.omit({ id: true }));
    if ("response" in body) return body.response;
    return NextResponse.json(
      await cancelItem(auth.scope, { ...body.data, id })
    );
  });
}
