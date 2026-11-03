import { NextRequest, NextResponse } from "next/server";

import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";
import { readThreadAsOwner } from "@/services/agent-hub/messages";

type Params = { params: Promise<{ id: string }> };

/** Opening a thread marks its alert read. */
export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(
      await readThreadAsOwner(auth.scope, id, { markSeen: true })
    );
  });
}
