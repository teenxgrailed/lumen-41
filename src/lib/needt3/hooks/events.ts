"use client";

import { useCallback } from "react";

import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { type ApiFeed, isProviderFeed } from "@/lib/needt3/calendars";
import { eventsInRange } from "@/lib/needt3/derive";
import {
  type ApiEvent,
  type V3Event,
  eventFromApi,
  eventPatchToApi,
} from "@/lib/needt3/map";
import {
  createProviderEvent,
  deleteProviderEvent,
  updateProviderEvent,
} from "@/lib/needt3/provider-events";
import { type DateRange, qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import {
  dropListItem,
  fetchJson,
  findListItem,
  patchListItem,
  previousFields,
  sendJson,
  useUndoableMutation,
} from "./core";
import { useTimeZone } from "./settings";

const EVENTS = qk.events();
const CALENDARS_KEY = [...EVENTS, "calendars"] as const;
const LOG_SOURCE = "needt3-events";

export type { ApiFeed };

/**
 * Calendar events (local-first copy, `GET /api/events`) with their source
 * resolved from the feed type. `range` keeps events that touch [from, to).
 */
export function useEvents(range?: DateRange) {
  const tz = useTimeZone();
  return useQuery({
    queryKey: qk.events(range),
    queryFn: async () => {
      const [rows, feeds] = await Promise.all([
        fetchJson<ApiEvent[]>("/api/events"),
        fetchJson<ApiFeed[]>("/api/feeds"),
      ]);
      //todo: GET /api/events has no range filter yet; filtered here.
      const typeOf = new Map(feeds.map((f) => [f.id, f.type]));
      const list = rows.map((r) => eventFromApi(r, tz, typeOf.get(r.feedId)));
      return range ? eventsInRange(list, range.from, range.to) : list;
    },
  });
}

/** The person's calendars (feeds), for the calendar picker. */
export function useCalendars() {
  return useQuery({
    queryKey: CALENDARS_KEY,
    queryFn: () => fetchJson<ApiFeed[]>("/api/feeds"),
    staleTime: 5 * 60_000,
  });
}

/**
 * Which feed type each event we wrote or removed belongs to. The cache may
 * not hold the event any more (it was just dropped for a delete) or yet (it
 * was just created), so the type is remembered here by event id.
 */
const feedTypeOfEvent = new Map<string, string>();
/** A provider event removed, kept so that undo can write it back. */
const removedProviderEvents = new Map<string, V3Event>();

function cachedFeeds(qc: QueryClient) {
  return qc.getQueryData<ApiFeed[]>(CALENDARS_KEY);
}

async function feedById(qc: QueryClient, id: string): Promise<ApiFeed | null> {
  const feeds = cachedFeeds(qc) ?? (await fetchJson<ApiFeed[]>("/api/feeds"));
  return feeds.find((f) => f.id === id) ?? null;
}

/** The feed type an event lives in: remembered, cached, or asked of the API. */
async function eventFeedType(
  qc: QueryClient,
  id: string
): Promise<string | null> {
  const known = feedTypeOfEvent.get(id);
  if (known) return known;
  const cached = findListItem<V3Event>(qc, EVENTS, id);
  if (cached) {
    const feed = await feedById(qc, cached.calendarId);
    if (feed) return feed.type;
  }
  try {
    const row = await fetchJson<{ feed?: { type?: string } | null }>(
      `/api/events/${id}`
    );
    return row.feed?.type ?? null;
  } catch {
    return null;
  }
}

type EventPatch = Partial<
  Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay">
>;

/** Retitle, move or resize an event; undo puts the old fields back. */
export function useUpdateEvent() {
  const tz = useTimeZone();
  const qc = useQueryClient();
  return useUndoableMutation<
    { id: string; patch: EventPatch; isAllDay?: boolean },
    unknown
  >({
    scope: EVENTS,
    label: "update the event",
    inverse: (qc, { id, patch }) => {
      const cur = findListItem<V3Event>(qc, EVENTS, id);
      return cur
        ? { id, patch: previousFields(cur, patch), isAllDay: cur.isAllDay }
        : null;
    },
    optimistic: (qc, { id, patch }) =>
      patchListItem<V3Event>(qc, EVENTS, id, (e) => ({ ...e, ...patch })),
    request: async ({ id, patch, isAllDay }) => {
      const body = eventPatchToApi(patch, tz, isAllDay);
      const type = await eventFeedType(qc, id);
      /* A synced calendar is written at the provider first; the route then
         brings the local row in step. */
      if (type && isProviderFeed({ type }))
        return updateProviderEvent(type, id, body);
      return sendJson(`/api/events/${id}`, "PATCH", body);
    },
  });
}

type EventVars =
  | {
      create: Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay"> & {
        calendarId: string;
        location?: string | null;
      };
    }
  | { remove: string }
  | { restore: string };

/** Create, remove (archive) and restore events — each undoes the other. */
export function useEventLifecycle() {
  const tz = useTimeZone();
  const qc = useQueryClient();
  return useUndoableMutation<EventVars, ApiEvent | null>({
    scope: EVENTS,
    label: "change the event",
    inverseFromResult: true,
    inverse: (_qc, vars, result) => {
      if ("create" in vars) return result ? { remove: result.id } : null;
      if ("remove" in vars) {
        /* A provider delete is final (nothing to restore): undo writes the
           event back as a new one. */
        const gone = removedProviderEvents.get(vars.remove);
        removedProviderEvents.delete(vars.remove);
        return gone
          ? {
              create: {
                title: gone.title,
                startAt: gone.startAt,
                endAt: gone.endAt,
                isAllDay: gone.isAllDay,
                calendarId: gone.calendarId,
                location: gone.location ?? null,
              },
            }
          : { restore: vars.remove };
      }
      return { remove: vars.restore };
    },
    optimistic: (qc, vars) => {
      if (!("remove" in vars)) return;
      const cur = findListItem<V3Event>(qc, EVENTS, vars.remove);
      const feed = cur
        ? cachedFeeds(qc)?.find((f) => f.id === cur.calendarId)
        : undefined;
      if (cur && feed) {
        feedTypeOfEvent.set(vars.remove, feed.type);
        if (isProviderFeed(feed)) removedProviderEvents.set(vars.remove, cur);
      }
      dropListItem<V3Event>(qc, EVENTS, vars.remove);
    },
    request: async (vars) => {
      if ("remove" in vars) {
        const type = await eventFeedType(qc, vars.remove);
        if (type && isProviderFeed({ type })) {
          try {
            await deleteProviderEvent(type, vars.remove);
          } catch (error) {
            removedProviderEvents.delete(vars.remove);
            throw error;
          }
          return null;
        }
        removedProviderEvents.delete(vars.remove);
        await sendJson(`/api/events/${vars.remove}`, "DELETE");
        return null;
      }
      if ("restore" in vars)
        return sendJson<ApiEvent>(`/api/events/${vars.restore}`, "PATCH", {
          restore: true,
        });
      const { calendarId, location, ...fields } = vars.create;
      const body = {
        ...(location ? { location } : {}),
        ...eventPatchToApi(fields, tz, fields.isAllDay),
      };
      const feed = await feedById(qc, calendarId);
      if (feed && isProviderFeed(feed)) {
        const made = await createProviderEvent(feed, body);
        if (made) feedTypeOfEvent.set(made.id, feed.type);
        return made;
      }
      return sendJson<ApiEvent>("/api/events", "POST", {
        feedId: calendarId,
        ...body,
      });
    },
  });
}

/** Name of the calendar Needt creates when a person has nowhere to write. */
export const NEEDT_CALENDAR_NAME = "Needt";

/**
 * Where a new event goes when nothing was picked: an enabled Needt (LOCAL)
 * calendar, or none. A person can pick a synced calendar (Google, Outlook,
 * CalDAV) in the pickers; that choice arrives as `calendarId`.
 */
export function pickWritableCalendar(feeds: ApiFeed[]): ApiFeed | null {
  const enabled = feeds.filter((f) => f.enabled !== false);
  return enabled.find((f) => f.type === "LOCAL") ?? null;
}

/**
 * Create an event without the caller choosing a calendar. If the person
 * has no LOCAL calendar yet, one named "Needt" is created first
 * (POST /api/feeds), so the Composer's Event kind and the Calendar's
 * click-a-slot draft always have somewhere to write. Undo removes the event.
 */
export function useCreateEvent() {
  const qc = useQueryClient();
  const lifecycle = useEventLifecycle();
  return useCallback(
    async (
      fields: Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay"> & {
        /** A calendar the person picked; else the default writable one. */
        calendarId?: string | null;
        location?: string | null;
      }
    ) => {
      const { calendarId, ...rest } = fields;
      let calendar: Pick<ApiFeed, "id">;
      try {
        calendar = calendarId ? { id: calendarId } : await writableCalendar(qc);
      } catch (error) {
        notify.error("Could not find a calendar for this event.");
        void logger.error(
          "v3 event calendar lookup failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
        throw error;
      }
      return lifecycle.mutateAsync({
        create: { ...rest, calendarId: calendar.id },
      });
    },
    [qc, lifecycle]
  );
}

/* One creation at a time: two quick commits (or the Composer and a
 * Calendar draft together) must not make two "Needt" calendars. */
let pendingCalendar: Promise<ApiFeed> | null = null;

export function writableCalendar(
  qc: ReturnType<typeof useQueryClient>
): Promise<ApiFeed> {
  if (pendingCalendar) return pendingCalendar;
  pendingCalendar = (async () => {
    const feeds =
      qc.getQueryData<ApiFeed[]>(CALENDARS_KEY) ??
      (await fetchJson<ApiFeed[]>("/api/feeds"));
    const found = pickWritableCalendar(feeds);
    if (found) return found;
    const created = await sendJson<ApiFeed>("/api/feeds", "POST", {
      name: NEEDT_CALENDAR_NAME,
      type: "LOCAL",
      enabled: true,
    });
    qc.setQueryData<ApiFeed[]>(CALENDARS_KEY, [...feeds, created]);
    return created;
  })().finally(() => {
    pendingCalendar = null;
  });
  return pendingCalendar;
}
