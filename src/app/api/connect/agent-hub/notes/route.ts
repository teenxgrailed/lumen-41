import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
  queryOf,
} from "@/services/agent-hub/http";
import { searchNotes, writeNote } from "@/services/agent-hub/notes";
import { noteSearchInput, noteWriteInput } from "@/services/agent-hub/schemas";

/** `?query=&tags=a,b&itemId=&authorAgent=&limit=` newest first, max 25. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { params, number } = queryOf(request);
    const tags = params.get("tags")?.split(",").filter(Boolean);
    const parsed = noteSearchInput.safeParse({
      query: params.get("query") ?? undefined,
      tags: tags?.length ? tags : undefined,
      itemId: params.get("itemId") ?? undefined,
      authorAgent: params.get("authorAgent") ?? undefined,
      limit: number("limit"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: 400, error: "INVALID", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(await searchNotes(auth.scope, parsed.data));
  });
}

export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, noteWriteInput);
    if ("response" in body) return body.response;
    return NextResponse.json(await writeNote(auth.scope, body.data), {
      status: 201,
    });
  });
}
