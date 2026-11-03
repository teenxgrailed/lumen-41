import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { listReservations, reserve } from "@/services/agent-hub/reservations";
import { reserveInput } from "@/services/agent-hub/schemas";

/** Everyone's active reservations in the workspace. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    return NextResponse.json(
      await listReservations(auth.scope, auth.scope.actor.agent.id)
    );
  });
}

/** Reserve (or renew) a resource; 409 CONFLICT names the holder and expiry. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, reserveInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await reserve(auth.scope, body.data), {
      status: 201,
    });
  });
}
