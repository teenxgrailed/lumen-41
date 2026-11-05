import { NextRequest, NextResponse } from "next/server";

import { listAgentsForOwner } from "@/services/agent-hub/agents";
import {
  authenticateHubOwner,
  hubRoute,
  queryOf,
} from "@/services/agent-hub/http";
import { listItems } from "@/services/agent-hub/items";
import { mapGraph } from "@/services/agent-hub/map-graph";
import { searchNotes } from "@/services/agent-hub/notes";
import { listReservations } from "@/services/agent-hub/reservations";

/**
 * Everything the Agents screen shows, for the signed-in owner. `?graph=1`
 * adds the Map's compact links and counts (per-agent activity by day, thread
 * to item links, messages this week) in the same request.
 */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { params } = queryOf(request);
    const includeArchived = params.get("includeArchived") === "true";
    const tag = params.get("tag")?.trim();
    const withGraph = params.get("graph") === "1";
    const [agents, items, notes, reservations, graph] = await Promise.all([
      listAgentsForOwner(auth.scope),
      listItems(auth.scope, { includeArchived }),
      searchNotes(auth.scope, {
        all: true,
        limit: 100,
        ...(tag ? { tags: [tag] } : {}),
      }),
      listReservations(auth.scope),
      withGraph ? mapGraph(auth.scope) : null,
    ]);
    return NextResponse.json({
      workspaceId: auth.scope.workspaceId,
      agents,
      items,
      notes: notes.notes,
      reservations: reservations.reservations,
      ...(graph ? { graph } : {}),
    });
  });
}
