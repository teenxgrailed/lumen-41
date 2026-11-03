import { NextRequest, NextResponse } from "next/server";

import { listActivity } from "@/services/agent-hub/activity";
import {
  authenticateHubOwner,
  hubRoute,
  queryOf,
} from "@/services/agent-hub/http";
import { activityInput } from "@/services/agent-hub/schemas";

/** `?agent=&kinds=a,b&cursor=&limit=` newest first, 50 a page. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { params, number } = queryOf(request);
    const kinds = params.get("kinds")?.split(",").filter(Boolean);
    const parsed = activityInput.safeParse({
      agent: params.get("agent") ?? undefined,
      kinds: kinds?.length ? kinds : undefined,
      cursor: params.get("cursor") ?? undefined,
      limit: number("limit"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: 400, error: "INVALID", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(await listActivity(auth.scope, parsed.data));
  });
}
