/** @jest-environment jsdom */
import { act, createElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { useIdeaSlots } from "../useIdeaSlots";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const card = (id: string, after: number, shown = false) => ({
  id,
  title: `Check news ${id}`,
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

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

class FakeObserver {
  static all: FakeObserver[] = [];
  constructor(public cb: (e: unknown[]) => void) {
    FakeObserver.all.push(this);
  }
  observe() {}
  disconnect() {}
  see(ratio = 1) {
    this.cb([{ isIntersecting: true, intersectionRatio: ratio }]);
  }
}

const fetchMock = jest.fn();
const calls = (suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

/** Five rows, the slots drawn after each, as the plan list does. */
function Rows() {
  const ideas = useIdeaSlots({
    day: "2026-11-23",
    visibleTasks: 5,
    enabled: true,
    renderTaken: () => null,
  });
  const out = [1, 2, 3, 4, 5].flatMap((n) => [
    createElement("p", { key: `r${n}`, "data-row": n }, `row ${n}`),
    ideas.after(n, 5),
  ]);
  return createElement("div", null, out);
}

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(Rows)
      )
    );
  });
  await settle();
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  FakeObserver.all = [];
  Object.assign(globalThis, {
    fetch: fetchMock,
    IntersectionObserver: FakeObserver,
  });
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/shown")) return json({ result: { shown: true } });
    if (url.endsWith("/take"))
      return json({
        result: {
          task: { id: "t9", title: "Check news a" },
          placed: { start: "2026-11-23T09:40:00Z", end: null, today: true },
          day: "2026-11-23",
        },
        actionId: "act-take",
      });
    if (url.endsWith("/skip"))
      return json({
        result: { snoozedUntil: "2026-11-30", archived: false },
        actionId: "act-skip",
      });
    if (url.includes("/undo")) return json({});
    return json({ result: { day: "2026-11-23", cards: [card("a", 2)] } });
  });
});

describe("idea cards on Today", () => {
  it("asks for the Today surface with the row count, and draws the card after the row the server named", async () => {
    const { host, unmount } = await mount();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/ideas/cards?day=2026-11-23&surface=today&visibleTasks=5"
    );
    const order = Array.from(host.querySelector("div")!.children).map(
      (el) => el.getAttribute("data-idea-slot") ?? el.textContent
    );
    expect(order).toEqual(["row 1", "row 2", "a", "row 3", "row 4", "row 5"]);
    await unmount();
  });

  it("counts a card as shown only once it is on screen, once", async () => {
    const { unmount } = await mount();
    // fetched and drawn, but not seen: nothing was sent
    expect(calls("/shown")).toHaveLength(0);
    act(() => FakeObserver.all[0].see(0.3));
    await settle();
    expect(calls("/shown")).toHaveLength(0);
    act(() => FakeObserver.all[0].see(0.9));
    await settle();
    expect(calls("/shown")).toHaveLength(1);
    expect(String(calls("/shown")[0][0])).toBe("/api/ideas/a/shown");
    expect(JSON.parse(calls("/shown")[0][1].body)).toEqual({ position: 2 });
    await unmount();
  });

  it("Take: the card folds to the confirmation, Undo brings it back", async () => {
    const { host, unmount } = await mount();
    const slot = () => host.querySelector("[data-idea-slot]")!;
    expect(slot().getAttribute("data-phase")).toBe("idea");
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-idea-take]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(calls("/take")).toHaveLength(1);
    expect(slot().getAttribute("data-phase")).toBe("took");
    expect(slot().textContent).toContain("Added to Today");
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-idea-added] .ic-undo")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(String(calls("")[calls("").length - 1][0])).toContain(
      "/api/ideas/cards"
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === "/api/agent/actions/act-take/undo"
      )
    ).toBe(true);
    expect(slot().getAttribute("data-phase")).toBe("idea");
    await unmount();
  });

  it("Skip: the card folds to one line with Undo", async () => {
    const { host, unmount } = await mount();
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-idea-skip]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const slot = host.querySelector("[data-idea-slot]")!;
    expect(calls("/skip")).toHaveLength(1);
    expect(slot.getAttribute("data-phase")).toBe("skipped");
    expect(slot.textContent).toContain("Hidden for 7 days");
    await unmount();
  });
});
