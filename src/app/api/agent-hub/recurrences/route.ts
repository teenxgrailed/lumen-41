import { NextRequest, NextResponse } from "next/server";

import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";
import { listRecurrences } from "@/services/agent-hub/recurrences";

/** Every recurrence of the owner's workspace, for the Agents screen. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    return NextResponse.json(
      await listRecurrences(auth.scope, { includeInactive: true })
    );
  });
}
