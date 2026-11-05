/** @jest-environment jsdom */
import { act, createElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { qk } from "@/lib/needt3/query-keys";

import { type V3Settings, applyPrefsPatch, useSetPref } from "../settings";

jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn() } }));

const settings: V3Settings = {
  theme: "system",
  defaultView: "week",
  timeZone: "Europe/Zurich",
  weekStartDay: "monday",
  timeFormat: "24h",
  prefs: { accent: "green", docsSort: "viewed" },
};

async function withSetPref(
  qc: QueryClient,
  run: (setPref: ReturnType<typeof useSetPref>) => Promise<void>
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let setPref: ReturnType<typeof useSetPref> | null = null;
  function Probe() {
    setPref = useSetPref();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: qc }, createElement(Probe))
    );
  });
  await act(async () => run(setPref!));
  act(() => root.unmount());
}

describe("useSetPref", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(String(init.body)),
      text: async () => String(init.body),
    }));
    Object.assign(globalThis, { fetch: fetchMock });
  });

  it("sends only the key it sets: the server merges, so a stale cache cannot clobber other keys", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.settings(), settings);
    await withSetPref(qc, async (setPref) => {
      await setPref("usage", false);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/user-settings");
    expect(JSON.parse(String(init.body))).toEqual({
      prefs: { usage: false },
    });
  });

  it("writes before settings are cached too: a patch wipes nothing", async () => {
    const qc = new QueryClient();
    await withSetPref(qc, async (setPref) => {
      await setPref("usage", false);
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      prefs: { usage: false },
    });
  });

  it("two writes started together each send their own key, in order, and the cache keeps both", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.settings(), settings);
    await withSetPref(qc, async (setPref) => {
      await Promise.all([
        setPref("seenIconPicker", true),
        setPref("sidebar", { open: true }),
      ]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).prefs).toEqual({
      seenIconPicker: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).prefs).toEqual({
      sidebar: { open: true },
    });
  });

  it("null removes a key from the cache, as the server does", () => {
    expect(applyPrefsPatch({ a: 1, b: 2 }, { b: null, c: 3 })).toEqual({
      a: 1,
      c: 3,
    });
  });
});
