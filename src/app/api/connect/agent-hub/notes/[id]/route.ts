import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { updateNote } from "@/services/agent-hub/notes";
import { noteWriteInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** An agent edits its own note, unless the owner has edited it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(
      request,
      noteWriteInput.pick({ text: true, tags: true }).partial()
    );
    if ("response" in body) return body.response;
    return NextResponse.json(await updateNote(auth.scope, id, body.data));
  });
}
