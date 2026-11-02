import type { ApiEvent } from "@/lib/needt3/map";

import { providerEventsRoute } from "./calendars";
import { sendJson } from "./hooks/core";

/**
 * Writes of v3 events into a synced calendar. They go through the same
 * routes the legacy calendar store uses (`/api/calendar/{google,outlook,
 * caldav}/events`): the provider is written first, then the route mirrors the
 * result into the local CalendarEvent row. A provider failure throws before
 * any local row exists, so nothing is left behind.
 */

function routeOf(type: string): string {
  const route = providerEventsRoute(type);
  if (!route) throw new Error(`${type} is not a synced calendar`);
  return route;
}

/** The routes answer with one row or a list of rows; the first is the event. */
function firstEvent(res: ApiEvent | ApiEvent[] | null): ApiEvent | null {
  return Array.isArray(res) ? (res[0] ?? null) : (res ?? null);
}

export async function createProviderEvent(
  feed: { id: string; type: string },
  fields: Record<string, unknown>
): Promise<ApiEvent | null> {
  const res = await sendJson<ApiEvent | ApiEvent[] | null>(
    routeOf(feed.type),
    "POST",
    { feedId: feed.id, ...fields }
  );
  return firstEvent(res);
}

export async function updateProviderEvent(
  type: string,
  eventId: string,
  updates: Record<string, unknown>
): Promise<ApiEvent | null> {
  const res = await sendJson<ApiEvent | ApiEvent[] | null>(
    routeOf(type),
    "PUT",
    { eventId, ...updates }
  );
  return firstEvent(res);
}

/** Deletes at the provider and drops the local row (the route does both). */
export async function deleteProviderEvent(
  type: string,
  eventId: string
): Promise<void> {
  await sendJson(routeOf(type), "DELETE", { eventId });
}
