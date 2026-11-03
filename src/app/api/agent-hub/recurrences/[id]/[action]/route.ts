import { NextRequest, NextResponse } from "next/server";

import { HubError } from "@/services/agent-hub/errors";
import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";
import { updateRecurrence } from "@/services/agent-hub/recurrences";
import { recurrenceUpdateInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string; action: string }> };

/** Owner-only: pause, resume or delete a recurrence. Session auth only. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const { id, action } = await params;
    const parsed = recurrenceUpdateInput.safeParse({ id, action });
    if (!parsed.success) {
      throw new HubError("NOT_FOUND", "Not found");
    }
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    return NextResponse.json(await updateRecurrence(auth.scope, parsed.data));
  });
}
