import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubOwner,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { deleteNote, updateNote } from "@/services/agent-hub/notes";
import { noteWriteInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** The owner edits any note; it is then marked owner-edited. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
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

export async function DELETE(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await deleteNote(auth.scope, id));
  });
}
