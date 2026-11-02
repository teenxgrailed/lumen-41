import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  queryOf,
} from "@/services/agent-hub/http";
import { agentInbox } from "@/services/agent-hub/inbox";
import { inboxInput } from "@/services/agent-hub/schemas";

/** `?view=inbox|created&itemId=&includeArchived=true&limit=`. Does not claim. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { params, number } = queryOf(request);
    const parsed = inboxInput.safeParse({
      view: params.get("view") ?? undefined,
      itemId: params.get("itemId") ?? undefined,
      includeArchived: params.get("includeArchived") === "true" || undefined,
      limit: number("limit"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: 400, error: "INVALID", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(await agentInbox(auth.scope, parsed.data));
  });
}
