/** @jest-environment jsdom */
import { act, createElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { qk } from "@/lib/needt3/query-keys";

import { useIdeaCards } from "../ideas";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn() },
}));

type Hook = ReturnType<typeof useIdeaCards>;

const card = (id: string, after: number, shown = false) => ({
  id,
  title: `Idea ${id}`,
  icon: null,
  projectId: "p1",
  project: "Learning",
  hue: "#8b6cf0",
  minutes: 15,
  source: "user",
  skipCount: 0,
  after,
  shown,
});

const fetchMock = jest.fn();
const json = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** The query cache tells React a macrotask later. */
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function mount(
  qc: QueryClient,
  options: Parameters<typeof useIdeaCards>[0] = {}
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const seen: { current: Hook | null } = { current: null };
  function Probe() {
    seen.current = useIdeaCards(options);
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: qc }, createElement(Probe))
    );
  });
  // let the query settle
  const settled = () =>
    options.enabled === false ||
    (fetchMock.mock.calls.length > 0 &&
      qc.isFetching() === 0 &&
      seen.current?.loading === false);
  for (let i = 0; i < 300 && !settled(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  // the query's notification reaches React a tick later
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return {
    hook: () => seen.current!,
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  Object.assign(globalThis, { fetch: fetchMock });
});

describe("useIdeaCards", () => {
  it("returns the day's cards from the server, with their position hints", async () => {
    fetchMock.mockResolvedValue(
      json({
        result: { day: "2026-11-23", cards: [card("a", 2), card("b", 5)] },
      })
    );
    const qc = new QueryClient();
    const { hook, unmount } = await mount(qc, {
      day: "2026-11-23",
      visibleTasks: 8,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/ideas/cards?day=2026-11-23&visibleTasks=8"
    );
    expect(hook().loading).toBe(false);
    expect(hook().cards.map((c) => [c.id, c.after])).toEqual([
      ["a", 2],
      ["b", 5],
    ]);
    // the fields the design lab's card needs
    expect(hook().cards[0]).toMatchObject({
      title: "Idea a",
      project: "Learning",
      hue: "#8b6cf0",
      minutes: 15,
    });
    unmount();
  });

  it("no cards and the reason when the server sends none", async () => {
    fetchMock.mockResolvedValue(
      json({ result: { day: "2026-11-23", cards: [], none: "off" } })
    );
    const { hook, unmount } = await mount(new QueryClient());
    expect(hook().cards).toEqual([]);
    expect(hook().none).toBe("off");
    unmount();
  });

  it("is not asked when disabled", async () => {
    const { hook, unmount } = await mount(new QueryClient(), {
      enabled: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook().cards).toEqual([]);
    unmount();
  });

  it("markShown posts once per card with its position, and never for one already shown", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/shown")
        ? json({ result: { shown: true }, actionId: "a" })
        : json({
            result: {
              day: "2026-11-23",
              cards: [card("a", 2), card("b", 5, true)],
            },
          })
    );
    const { hook, unmount } = await mount(new QueryClient());
    // reading the cards sent nothing but the read itself
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/ideas/cards"]);
    const [a, b] = hook().cards;
    await act(async () => {
      await hook().markShown(a);
      await hook().markShown(a);
      await hook().markShown(b);
    });
    await tick();
    const posts = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/shown")
    );
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/ideas/a/shown");
    expect(JSON.parse(posts[0][1].body)).toEqual({ position: 2 });
    expect(hook().cards.find((c) => c.id === "a")?.shown).toBe(true);
    unmount();
  });

  it("a refused markShown is swallowed and not retried", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/shown")
        ? {
            ok: false,
            status: 409,
            statusText: "Conflict",
            text: async () => '{"error":"The day\'s cards are already shown"}',
          }
        : json({ result: { day: "2026-11-23", cards: [card("a", 2)] } })
    );
    const { hook, unmount } = await mount(new QueryClient());
    const a = hook().cards[0];
    await act(async () => {
      await hook().markShown(a);
      await hook().markShown(a);
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/shown"))
    ).toHaveLength(1);
    unmount();
  });

  it("take: posts, drops the card at once and refreshes the task lists", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/take")
        ? json({
            result: {
              task: { id: "a", title: "Idea a" },
              placed: { start: "2026-11-23T09:40:00Z", end: null, today: true },
              day: "2026-11-23",
            },
            actionId: "act1",
          })
        : json({
            result: { day: "2026-11-23", cards: [card("a", 2), card("b", 5)] },
          })
    );
    const qc = new QueryClient();
    qc.setQueryData(qk.tasks(), []);
    const { hook, unmount } = await mount(qc);
    let out: Awaited<ReturnType<Hook["take"]>> | undefined;
    await act(async () => {
      out = await hook().take("a");
    });
    await tick();
    expect(out?.actionId).toBe("act1");
    expect(out?.result.placed?.today).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === "/api/ideas/a/take" && init.method === "POST"
      )
    ).toBe(true);
    expect(hook().cards.map((c) => c.id)).toEqual(["b"]);
    expect(qc.getQueryState(qk.tasks())?.isInvalidated).toBe(true);
    unmount();
  });

  it("skip: posts and drops the card", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/skip")
        ? json({
            result: { snoozedUntil: "2026-11-30T09:00:00Z", archived: false },
            actionId: "act2",
          })
        : json({ result: { day: "2026-11-23", cards: [card("a", 2)] } })
    );
    const { hook, unmount } = await mount(new QueryClient());
    await act(async () => {
      await hook().skip("a");
    });
    await tick();
    expect(hook().cards).toEqual([]);
    unmount();
  });

  it("undo: runs the action's inverse", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/undo")
        ? json({ status: "undone" })
        : json({ result: { day: "2026-11-23", cards: [] } })
    );
    const { hook, unmount } = await mount(new QueryClient());
    await act(async () => {
      await hook().undo("act1");
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === "/api/agent/actions/act1/undo" && init.method === "POST"
      )
    ).toBe(true);
    unmount();
  });
});
