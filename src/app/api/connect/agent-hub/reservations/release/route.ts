import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { releaseReservation } from "@/services/agent-hub/reservations";
import { releaseInput } from "@/services/agent-hub/schemas";

export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, releaseInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await releaseReservation(auth.scope, body.data));
  });
}
