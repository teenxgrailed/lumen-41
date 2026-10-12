/**
 * @jest-environment jsdom
 *
 * A board's references through the items routes: the list is mapped and
 * ordered as sent, unknown kinds are left out, Add undoes by deleting, Remove
 * undoes by making the reference again in the same place, and a failed
 * write puts the wall back.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import {
  type V3BoardItem,
  boardItemFromApi,
  boardItemsKey,
  draftFromItem,
  useAddBoardItem,
  useBoardItems,
  useRemoveBoardItem,
} from "../boards";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

/* jsdom has no Response: the little of it fetchJson reads. */
const reply = (status: number, body?: unknown) => ({
  ok: status < 400,
  status,
  statusText: "",
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
});

const row = (id: string, extra = {}) => ({
  id,
  moodboardId: "b1",
  kind: "color",
  color: "#D7263D",
  colorName: "Signal red",
  ratio: 0.8,
  position: 2,
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
  ...extra,
});

describe("mapping", () => {
  it("fills what the route leaves out with null", () => {
    expect(boardItemFromApi({ id: "i", kind: "note", text: "Oak" })).toEqual({
      id: "i",
      kind: "note",
      url: null,
      color: null,
      text: "Oak",
      title: null,
      ratio: null,
      colorName: null,
      source: null,
      thumbnailUrl: null,
      position: 0,
      createdAt: null,
    });
  });

  it("the draft that re-makes an item keeps its place and drops nulls", () => {
    const item = boardItemFromApi(row("i"));
    expect(draftFromItem(item)).toEqual({
      kind: "color",
      color: "#D7263D",
      colorName: "Signal red",
      ratio: 0.8,
      position: 2,
    });
  });
});

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const calls: { url: string; method: string; body?: unknown }[] = [];
let serverItems: ReturnType<typeof row>[] = [];
let failNext = false;

beforeEach(() => {
  calls.length = 0;
  failNext = false;
  serverItems = [row("i1"), row("i2", { position: 3 })];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (failNext && method !== "GET") return reply(403, { error: "no" });
    if (method === "GET")
      return reply(200, { items: [...serverItems, row("x", { kind: "pin" })] });
    if (method === "POST")
      return reply(201, { item: row("new", { position: 9 }) });
    return reply(204);
  }) as unknown as typeof fetch;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const api: {
  items?: V3BoardItem[];
  add?: ReturnType<typeof useAddBoardItem>;
  remove?: ReturnType<typeof useRemoveBoardItem>;
} = {};

function Probe() {
  api.items = useBoardItems("b1").data;
  api.add = useAddBoardItem();
  api.remove = useRemoveBoardItem();
  return null;
}
const flush = () =>
  act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mountProbe() {
  act(() => root.render(h(QueryClientProvider, { client }, h(Probe))));
  await flush();
  await flush();
}
const writes = () => calls.filter((c) => c.method !== "GET");

describe("useBoardItems", () => {
  it("reads the wall in the order sent and leaves out unknown kinds", async () => {
    await mountProbe();
    expect(api.items?.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(calls[0].url).toBe("/api/moodboards/b1/items");
  });
});

describe("remove and undo", () => {
  it("deletes, drops it from the wall, and Undo makes it again in the same place", async () => {
    await mountProbe();
    let undo: () => Promise<void> = async () => undefined;
    await act(async () => {
      undo = (await api.remove!.mutateAsync({ boardId: "b1", id: "i2" })).undo;
    });
    expect(writes()[0]).toMatchObject({
      url: "/api/moodboards/b1/items/i2",
      method: "DELETE",
    });
    await act(async () => {
      await undo();
    });
    expect(writes()[1]).toMatchObject({
      url: "/api/moodboards/b1/items",
      method: "POST",
      body: { kind: "color", color: "#D7263D", position: 3 },
    });
  });

  it("a refused remove puts the reference back on the wall", async () => {
    await mountProbe();
    failNext = true;
    await act(async () => {
      await api
        .remove!.mutateAsync({ boardId: "b1", id: "i1" })
        .catch(() => undefined);
    });
    expect(
      client.getQueryData<V3BoardItem[]>(boardItemsKey("b1"))?.map((i) => i.id)
    ).toContain("i1");
  });
});

describe("add and undo", () => {
  it("posts the draft, and Undo deletes what was made", async () => {
    await mountProbe();
    let res: Awaited<ReturnType<NonNullable<typeof api.add>["mutateAsync"]>>;
    await act(async () => {
      res = await api.add!.mutateAsync({
        boardId: "b1",
        draft: { kind: "note", text: "Oak", ratio: 0.7 },
      });
    });
    expect(writes()[0]).toMatchObject({
      url: "/api/moodboards/b1/items",
      method: "POST",
      body: { kind: "note", text: "Oak", ratio: 0.7 },
    });
    expect(res!.result?.id).toBe("new");
    await act(async () => {
      await res.undo();
    });
    expect(writes()[1]).toMatchObject({
      url: "/api/moodboards/b1/items/new",
      method: "DELETE",
    });
  });
});
