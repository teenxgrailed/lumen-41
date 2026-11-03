import { NextRequest, NextResponse } from "next/server";

import { linkItems, unlinkItems } from "@/services/agent-hub/graph";
import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { linkInput } from "@/services/agent-hub/schemas";

/** `{ fromId, toId, kind }`: blocks, parent, relates, duplicates, supersedes. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, linkInput);
    if ("response" in body) return body.response;
    const result = await linkItems(auth.scope, body.data);
    return NextResponse.json(result, { status: result.linked ? 201 : 200 });
  });
}

/** The same body removes the link. */
export async function DELETE(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, linkInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await unlinkItems(auth.scope, body.data));
  });
}
