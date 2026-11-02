import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { agentInbox } from "@/services/agent-hub/inbox";
import { createItem } from "@/services/agent-hub/items";
import { createItemInput } from "@/services/agent-hub/schemas";

/** Items the caller created, newest change first. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const archived =
      request.nextUrl.searchParams.get("includeArchived") === "true";
    return NextResponse.json(
      await agentInbox(auth.scope, {
        view: "created",
        includeArchived: archived,
        limit: 25,
      })
    );
  });
}

export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, createItemInput);
    if ("response" in body) return body.response;
    const result = await createItem(auth.scope, body.data);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}
