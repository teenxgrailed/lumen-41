import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
  queryOf,
} from "@/services/agent-hub/http";
import { listMessages, sendMessage } from "@/services/agent-hub/messages";
import { messageSendInput } from "@/services/agent-hub/schemas";

/** `?unreadOnly=true&limit=` your mail, unread first, grouped by thread. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { params, number } = queryOf(request);
    return NextResponse.json(
      await listMessages(auth.scope, {
        unreadOnly: params.get("unreadOnly") === "true",
        limit: number("limit"),
      })
    );
  });
}

export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, messageSendInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await sendMessage(auth.scope, body.data), {
      status: 201,
    });
  });
}
