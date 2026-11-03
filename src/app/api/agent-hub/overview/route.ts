import { NextRequest, NextResponse } from "next/server";

import { listAgentsForOwner } from "@/services/agent-hub/agents";
import {
  authenticateHubOwner,
  hubRoute,
  queryOf,
} from "@/services/agent-hub/http";
import { listItems } from "@/services/agent-hub/items";
import { searchNotes } from "@/services/agent-hub/notes";
import { listReservations } from "@/services/agent-hub/reservations";

/** Everything the Agents screen shows, for the signed-in owner. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { params } = queryOf(request);
    const includeArchived = params.get("includeArchived") === "true";
    const tag = params.get("tag")?.trim();
    const [agents, items, notes, reservations] = await Promise.all([
      listAgentsForOwner(auth.scope),
      listItems(auth.scope, { includeArchived }),
      searchNotes(auth.scope, {
        all: true,
        limit: 100,
        ...(tag ? { tags: [tag] } : {}),
      }),
      listReservations(auth.scope),
    ]);
    return NextResponse.json({
      workspaceId: auth.scope.workspaceId,
      agents,
      items,
      notes: notes.notes,
      reservations: reservations.reservations,
    });
  });
}
