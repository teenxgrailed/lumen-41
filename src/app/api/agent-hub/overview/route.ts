import { NextRequest, NextResponse } from "next/server";

import { listAgentsForOwner } from "@/services/agent-hub/agents";
import { mediaStubs } from "@/services/agent-hub/attachments";
import {
  authenticateHubOwner,
  hubRoute,
  queryOf,
} from "@/services/agent-hub/http";
import { listItems } from "@/services/agent-hub/items";
import { mapGraph } from "@/services/agent-hub/map-graph";
import { searchNotes } from "@/services/agent-hub/notes";
import { listReservations } from "@/services/agent-hub/reservations";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "agent-hub-overview";

/**
 * Everything the Agents screen shows, for the signed-in owner. `?graph=1`
 * adds the Map's compact links and counts (per-agent activity by day, thread
 * to item links, messages this week) in the same request. An item waiting
 * on the owner carries up to three media stubs for its card's previews.
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
      // The graph is decoration: if it fails, the overview still goes out
      // whole, with `graph: null`, and the Map draws without its counts.
      withGraph
        ? mapGraph(auth.scope).catch((error: unknown) => {
            logger.error(
              "Map graph failed; overview sent without it",
              { error: error instanceof Error ? error.message : String(error) },
              LOG_SOURCE
            );
            return null;
          })
        : null,
    ]);
    const waiting = items.filter((i) => i.status === "needs_owner");
    const media = await mediaStubs(
      auth.scope,
      waiting.map((i) => i.id)
    );
    return NextResponse.json({
      workspaceId: auth.scope.workspaceId,
      agents,
      items: media.size
        ? items.map((i) =>
            media.has(i.id) ? { ...i, media: media.get(i.id) } : i
          )
        : items,
      notes: notes.notes,
      reservations: reservations.reservations,
      ...(withGraph ? { graph } : {}),
    });
  });
}
