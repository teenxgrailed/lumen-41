import { NextRequest, NextResponse } from "next/server";

import { authenticateHubAgent, hubRoute } from "@/services/agent-hub/http";
import { ackMessage } from "@/services/agent-hub/messages";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await ackMessage(auth.scope, id));
  });
}
