import { NextRequest, NextResponse } from "next/server";

import { createPlan } from "@/services/agent-hub/graph";
import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { planCreateInput } from "@/services/agent-hub/schemas";

/** A parent item and its ordered steps in one call. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, planCreateInput);
    if ("response" in body) return body.response;
    const result = await createPlan(auth.scope, body.data);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}
