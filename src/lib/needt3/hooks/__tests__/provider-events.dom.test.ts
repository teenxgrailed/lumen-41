/**
 * @jest-environment jsdom
 *
 * v3 events written into a synced calendar go to the provider route, not to
 * the local-only `/api/events`. Undo of a create deletes on the provider, and
 * a refused provider write is said once and leaves nothing in the cache.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { useCreateEvent, useEventLifecycle } from "../events";

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
    name: "Needt",
    enabled: true,
    url: "me@gmail.com",
    account: { email: "me@gmail.com" },
  },
];
const FIELDS = {
  title: "Needt demo event",
  startAt: "2026-11-06T11:00",
  endAt: "2026-11-06T11:30",
  isAllDay: false,
};

let host: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
let providerOk = true;
const api: {
  create?: ReturnType<typeof useCreateEvent>;
  life?: ReturnType<typeof useEventLifecycle>;
} = {};

function Probe() {
  api.create = useCreateEvent();
  api.life = useEventLifecycle();
  return null;
}

const calls = () =>
  fetchMock.mock.calls
    .map(([url, init]) => [
      String(init?.method ?? "GET"),
      String(url),
      init?.body ? JSON.parse(init.body as string) : undefined,
    ])
    .filter(
      ([, url]) => url.startsWith("/api/calendar/") || url === "/api/events"
    );

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
    if (url === "/api/calendar/google/events" && init?.method === "POST")
      return providerOk
        ? reply([{ id: "ev1", feedId: "goog", title: FIELDS.title }])
        : reply({ error: "Failed to create event" }, false);
    return reply({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 0 } },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("creates an event on a GOOGLE feed through the Google route", async () => {
  await act(async () => {
    await api.create!({ ...FIELDS, calendarId: "goog" });
  });
  const writes = calls().filter(([m]) => m === "POST");
  expect(writes).toHaveLength(1);
  const [, url, body] = writes[0];
  expect(url).toBe("/api/calendar/google/events");
  expect(body).toMatchObject({ feedId: "goog", title: FIELDS.title });
  expect(body.start).toEqual(expect.any(String));
  expect(body.end).toEqual(expect.any(String));
});

it("still creates on a Needt (LOCAL) calendar through /api/events", async () => {
  await act(async () => {
    await api.create!({ ...FIELDS, calendarId: "local" });
  });
  const writes = calls().filter(([m]) => m === "POST");
  expect(writes.map(([, url]) => url)).toEqual(["/api/events"]);
});

it("undo of a create on Google deletes the event at the provider", async () => {
  let made: Awaited<ReturnType<NonNullable<typeof api.create>>> | undefined;
  await act(async () => {
    made = await api.create!({ ...FIELDS, calendarId: "goog" });
  });
  await act(async () => {
    await made!.undo();
  });
  const del = calls().filter(([m]) => m === "DELETE");
  expect(del).toEqual([
    ["DELETE", "/api/calendar/google/events", { eventId: "ev1" }],
  ]);
});

it("a refused provider write is said once and throws", async () => {
  providerOk = false;
  await act(async () => {
    await expect(
      api.create!({ ...FIELDS, calendarId: "goog" })
    ).rejects.toBeDefined();
  });
  expect(mockError).toHaveBeenCalledTimes(1);
  // nothing was sent to the local-only route as a fallback
  expect(calls().filter(([, url]) => url === "/api/events")).toHaveLength(0);
});
