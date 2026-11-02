import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { completeItem } from "@/services/agent-hub/items";
import { completeInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** Finish as done or failed with a result. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(request, completeInput.omit({ id: true }));
    if ("response" in body) return body.response;
    return NextResponse.json(
      await completeItem(auth.scope, { ...body.data, id })
    );
  });
}
