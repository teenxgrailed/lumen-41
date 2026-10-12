"use client";

import { useCallback } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/logger";
import { eventsInRange } from "@/lib/needt3/derive";
import {
  type ApiEvent,
  type V3Event,
  eventFromApi,
  eventPatchToApi,
} from "@/lib/needt3/map";
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

export interface ApiFeed {
  id: string;
  type: string;
  name: string;
  color?: string | null;
  enabled?: boolean;
}

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

type EventPatch = Partial<
  Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay">
>;

/** Retitle, move or resize an event; undo puts the old fields back. */
export function useUpdateEvent() {
  const tz = useTimeZone();
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
    request: ({ id, patch, isAllDay }) =>
      sendJson(
        `/api/events/${id}`,
        "PATCH",
        eventPatchToApi(patch, tz, isAllDay)
      ),
  });
}

type EventVars =
  | {
      create: Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay"> & {
        calendarId: string;
      };
    }
  | { remove: string }
  | { restore: string };

/** Create, remove (archive) and restore events — each undoes the other. */
export function useEventLifecycle() {
  const tz = useTimeZone();
  return useUndoableMutation<EventVars, ApiEvent | null>({
    scope: EVENTS,
    label: "change the event",
    inverseFromResult: true,
    inverse: (_qc, vars, result) => {
      if ("create" in vars) return result ? { remove: result.id } : null;
      if ("remove" in vars) return { restore: vars.remove };
      return { remove: vars.restore };
    },
    optimistic: (qc, vars) => {
      if ("remove" in vars) dropListItem<V3Event>(qc, EVENTS, vars.remove);
    },
    request: async (vars) => {
      if ("remove" in vars) {
        await sendJson(`/api/events/${vars.remove}`, "DELETE");
        return null;
      }
      if ("restore" in vars)
        return sendJson<ApiEvent>(`/api/events/${vars.restore}`, "PATCH", {
          restore: true,
        });
      const { calendarId, ...fields } = vars.create;
      return sendJson<ApiEvent>("/api/events", "POST", {
        feedId: calendarId,
        ...eventPatchToApi(fields, tz, fields.isAllDay),
      });
    },
  });
}

/** Name of the calendar Needt creates when a person has nowhere to write. */
export const NEEDT_CALENDAR_NAME = "Needt";

/**
 * Where a new event goes: an enabled Needt (LOCAL) calendar, or none.
 * Synced provider calendars are read-only from v3
 * (PATCH does not write back yet), so v3 never writes into them.
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
      fields: Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay">
    ) => {
      let calendar: ApiFeed;
      try {
        calendar = await writableCalendar(qc);
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
        create: { ...fields, calendarId: calendar.id },
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
