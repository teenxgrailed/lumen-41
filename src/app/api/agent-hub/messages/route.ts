import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { listThreadsForOwner, ownerPost } from "@/services/agent-hub/messages";
import { ownerMessageInput } from "@/services/agent-hub/schemas";

/** The Messages tab: threads, newest first. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    return NextResponse.json(await listThreadsForOwner(auth.scope));
  });
}

/** The owner replies in a thread, or writes to named agents. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, ownerMessageInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await ownerPost(auth.scope, body.data), {
      status: 201,
    });
  });
}
