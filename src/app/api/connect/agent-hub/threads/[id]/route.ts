import { NextRequest, NextResponse } from "next/server";

import { authenticateHubAgent, hubRoute } from "@/services/agent-hub/http";
import { readThread } from "@/services/agent-hub/messages";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await readThread(auth.scope, id));
  });
}
