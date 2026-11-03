import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { createItemWithRecurrence } from "@/services/agent-hub/recurrences";
import { createItemWithRecurrenceInput } from "@/services/agent-hub/schemas";

/** The owner creates an item for an agent from the Agents screen. */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, createItemWithRecurrenceInput);
    if ("response" in body) return body.response;
    return NextResponse.json(
      await createItemWithRecurrence(auth.scope, body.data),
      {
        status: 201,
      }
    );
  });
}
