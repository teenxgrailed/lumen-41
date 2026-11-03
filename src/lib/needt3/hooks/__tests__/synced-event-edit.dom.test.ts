/**
 * @jest-environment jsdom
 *
 * Editing an event that came from Google: a retitle, a drag-move or a resize
 * (the same `useUpdateEvent` the grid and the peek call) goes to the provider
 * route, a delete does too, and a refused provider write is said once with
 * the cache put back. An event on a Needt (LOCAL) calendar keeps the local
 * routes.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { eventGesturePatch } from "@/components/needt3/drag/event-drop";

import type { V3Event } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { useEventLifecycle, useUpdateEvent } from "../events";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockError = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    error: (...a: unknown[]) => mockError(...a),
    success: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const FEEDS = [
  { id: "local", type: "LOCAL", name: "Needt", enabled: true },
  {
    id: "goog",
    type: "GOOGLE",
    name: "Work",
    enabled: true,
    url: "me@gmail.com",
    account: { email: "me@gmail.com" },
  },
];

const event = (id: string, calendarId: string): V3Event => ({
  id,
  title: `Event ${id}`,
  startAt: "2026-11-06T10:00",
  endAt: "2026-11-06T11:00",
  isAllDay: false,
  calendarId,
  source: calendarId === "goog" ? "google" : "needt",
  externalId: null,
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;
let providerOk = true;
const api: {
  update?: ReturnType<typeof useUpdateEvent>;
  life?: ReturnType<typeof useEventLifecycle>;
} = {};

function Probe() {
  api.update = useUpdateEvent();
  api.life = useEventLifecycle();
  return null;
}

const writes = () =>
  fetchMock.mock.calls
    .map(([url, init]) => [
      String(init?.method ?? "GET"),
      String(url),
      init?.body ? JSON.parse(init.body as string) : undefined,
    ])
    .filter(([m]) => m !== "GET");

const cached = () => client.getQueryData<V3Event[]>(qk.events()) ?? [];

beforeEach(() => {
  mockError.mockReset();
  providerOk = true;
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const reply = (body: unknown, ok = true) => ({
      ok,
      status: ok ? 200 : 500,
      statusText: "",
      text: async () => JSON.stringify(body),
      json: async () => body,
    });
    if (url === "/api/feeds") return reply(FEEDS);
    if (url === "/api/calendar/google/events" && init?.method !== undefined)
      return providerOk
        ? reply([{ id: "g1", feedId: "goog", title: "Event g1" }])
        : reply({ error: "Failed to update event" }, false);
    return reply({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  client = new QueryClient({
    defaultOptions: { mutations: { retry: 0 }, queries: { retry: false } },
  });
  client.setQueryData(qk.events(), [event("g1", "goog"), event("l1", "local")]);
  client.setQueryData([...qk.events(), "calendars"], FEEDS);
  // the zone the stamps are read in
  client.setQueryData(qk.settings(), { timeZone: "UTC" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("retitles a Google event through the Google route", async () => {
  await act(async () => {
    await api.update!.mutateAsync({ id: "g1", patch: { title: "Renamed" } });
  });
  expect(writes()).toEqual([
    ["PUT", "/api/calendar/google/events", { eventId: "g1", title: "Renamed" }],
  ]);
});

it("a drag-move of a Google event writes the new start and end to the provider", async () => {
  // dropped an hour and a half lower on the grid, one column to the right
  const patch = eventGesturePatch(event("g1", "goog"), "move", 1.5, 1)!;
  await act(async () => {
    await api.update!.mutateAsync({ id: "g1", patch, isAllDay: false });
  });
  const [put] = writes();
  expect(put[0]).toBe("PUT");
  expect(put[1]).toBe("/api/calendar/google/events");
  expect(put[2]).toMatchObject({ eventId: "g1" });
  expect(new Date(put[2].start as string).toISOString()).toBe(
    "2026-11-07T11:30:00.000Z"
  );
  expect(new Date(put[2].end as string).toISOString()).toBe(
    "2026-11-07T12:30:00.000Z"
  );
  // the cache moved with it
  expect(cached().find((e) => e.id === "g1")).toMatchObject({
    startAt: "2026-11-07T11:30",
    endAt: "2026-11-07T12:30",
  });
});

it("a resize of a Google event writes only a later end", async () => {
  const patch = eventGesturePatch(event("g1", "goog"), "resize", 0.5)!;
  await act(async () => {
    await api.update!.mutateAsync({ id: "g1", patch, isAllDay: false });
  });
  const [put] = writes();
  expect(put[1]).toBe("/api/calendar/google/events");
  expect(new Date(put[2].start as string).toISOString()).toBe(
    "2026-11-06T10:00:00.000Z"
  );
  expect(new Date(put[2].end as string).toISOString()).toBe(
    "2026-11-06T11:30:00.000Z"
  );
});

it("undo of a move writes the old times back to the provider", async () => {
  const patch = eventGesturePatch(event("g1", "goog"), "move", 1)!;
  let undo: (() => Promise<void>) | undefined;
  await act(async () => {
    ({ undo } = await api.update!.mutateAsync({
      id: "g1",
      patch,
      isAllDay: false,
    }));
  });
  await act(async () => {
    await undo!();
  });
  const puts = writes().filter(([m]) => m === "PUT");
  expect(puts).toHaveLength(2);
  expect(new Date(puts[1][2].start as string).toISOString()).toBe(
    "2026-11-06T10:00:00.000Z"
  );
});

it("deletes a Google event at the provider", async () => {
  await act(async () => {
    await api.life!.mutateAsync({ remove: "g1" });
  });
  expect(writes()).toEqual([
    ["DELETE", "/api/calendar/google/events", { eventId: "g1" }],
  ]);
  expect(cached().map((e) => e.id)).toEqual(["l1"]);
});

it("a refused provider write is said once and the event comes back", async () => {
  providerOk = false;
  await act(async () => {
    await expect(api.life!.mutateAsync({ remove: "g1" })).rejects.toBeDefined();
  });
  expect(mockError).toHaveBeenCalledTimes(1);
  expect(cached().map((e) => e.id)).toEqual(["g1", "l1"]);
});

it("a Needt (LOCAL) event keeps the local routes", async () => {
  await act(async () => {
    await api.update!.mutateAsync({ id: "l1", patch: { title: "Mine" } });
  });
  await act(async () => {
    await api.life!.mutateAsync({ remove: "l1" });
  });
  expect(writes().map(([m, url]) => `${m} ${url}`)).toEqual([
    "PATCH /api/events/l1",
    "DELETE /api/events/l1",
  ]);
});
