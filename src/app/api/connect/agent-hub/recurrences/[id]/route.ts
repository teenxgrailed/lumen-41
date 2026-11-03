import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { updateRecurrence } from "@/services/agent-hub/recurrences";
import { recurrenceUpdateInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** `{ "action": "pause" | "resume" | "delete" }`. Only the creator may change it. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(
      request,
      recurrenceUpdateInput.omit({ id: true })
    );
    if ("response" in body) return body.response;
    return NextResponse.json(
      await updateRecurrence(auth.scope, { ...body.data, id })
    );
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(
      await updateRecurrence(auth.scope, { id, action: "delete" })
    );
  });
}
