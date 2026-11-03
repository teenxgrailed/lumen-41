import { NextRequest, NextResponse } from "next/server";

import { authenticateHubAgent, hubRoute } from "@/services/agent-hub/http";
import { nextItem } from "@/services/agent-hub/inbox";

/** `?skipIds=a,b`. The best next ready item for the caller; does not claim. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const skip = request.nextUrl.searchParams.get("skipIds");
    const skipIds = skip
      ? skip
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 20)
      : undefined;
    return NextResponse.json(await nextItem(auth.scope, { skipIds }));
  });
}
