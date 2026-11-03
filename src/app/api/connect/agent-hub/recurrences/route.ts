import { NextRequest, NextResponse } from "next/server";

import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import {
  createItemWithRecurrence,
  listRecurrences,
} from "@/services/agent-hub/recurrences";
import {
  createItemWithRecurrenceInput,
  recurrencesListInput,
} from "@/services/agent-hub/schemas";

/** Standing jobs the caller created or is assigned. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const query = recurrencesListInput.safeParse({
      includeInactive:
        request.nextUrl.searchParams.get("includeInactive") === "true",
      limit: request.nextUrl.searchParams.get("limit")
        ? Number(request.nextUrl.searchParams.get("limit"))
        : undefined,
    });
    if (!query.success) {
      return NextResponse.json(
        { status: 400, error: "INVALID", message: "Bad query." },
        { status: 400 }
      );
    }
    return NextResponse.json(await listRecurrences(auth.scope, query.data));
  });
}

/**
 * Create an item that repeats: the same body as POST /items with a required
 * `recurrence` ({ rrule, timezone?, allowOverlap? }). Pro.
 */
export async function POST(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const body = await parseJsonBody(request, createItemWithRecurrenceInput);
    if ("response" in body) return body.response;
    if (!body.data.recurrence) {
      return NextResponse.json(
        {
          status: 400,
          error: "INVALID",
          message: "recurrence: { rrule } is required.",
        },
        { status: 400 }
      );
    }
    const result = await createItemWithRecurrence(auth.scope, body.data);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  });
}
