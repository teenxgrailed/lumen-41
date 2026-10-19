/**
 * @jest-environment jsdom
 *
 * The Starter game hooks: the card's state is read once, and "Not now" /
 * "Don't show again" take the card away at once and are sent to the server.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { StarterGameStatus } from "@/lib/starter-game";

import { useHideStarterGame, useStarterGameStatus } from "../starter-game";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STATUS: StarterGameStatus = {
  hiddenUntil: null,
  neverShow: false,
  hidden: false,
  openTasks: 2,
  eligible: true,
  canPlay: true,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let fetchMock: jest.Mock;
let seen: {
  status: ReturnType<typeof useStarterGameStatus>;
  hide: ReturnType<typeof useHideStarterGame>;
} | null;

function Probe() {
  seen = { status: useStarterGameStatus(), hide: useHideStarterGame() };
  return h("p", { "data-eligible": String(seen.status.data?.eligible) });
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

beforeEach(async () => {
  seen = null;
  fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
    const body =
      init?.method === "PATCH"
        ? {
            ...STATUS,
            hidden: true,
            eligible: false,
            neverShow: JSON.parse(String(init.body)).hide === "never",
          }
        : STATUS;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(Probe)));
  });
  await settle();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("reads the card's state", () => {
  expect(seen?.status.data).toEqual(STATUS);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/starter-game");
});

it("Not now hides the card and is sent as 7d", async () => {
  await act(async () => {
    seen?.hide.mutate("7d");
  });
  await settle();
  const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH");
  expect(JSON.parse(patch[1].body)).toEqual({ hide: "7d" });
  expect(seen?.status.data?.eligible).toBe(false);
  expect(seen?.status.data?.hidden).toBe(true);
});

it("Don't show again is sent as never", async () => {
  await act(async () => {
    seen?.hide.mutate("never");
  });
  await settle();
  const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH");
  expect(JSON.parse(patch[1].body)).toEqual({ hide: "never" });
  expect(seen?.status.data?.neverShow).toBe(true);
});
