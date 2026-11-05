/**
 * @jest-environment jsdom
 *
 * The Agents screen on the night ground: /agents opens on the Map, every tab
 * is reachable by a click, by the arrow keys on the tab list and by `?tab=`,
 * and each tab shows its own content from the overview. Only the data hooks
 * are stubbed; the canvas has no 2D context in jsdom, so the Map is checked
 * through its DOM (panel, legend, result cards, agent buttons).
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { fetchJson } from "@/lib/needt3/hooks/core";

import { AgentsScreen } from "../AgentsScreen";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let search = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../settings/MemoriesGroup", () => ({
  MemoriesGroup: () =>
    jest
      .requireActual("react")
      .createElement("div", { "data-memories": "" }, "About you"),
}));
jest.mock("../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
  PlEmpty: () => null,
}));
jest.mock("../../paywall/Pro", () => ({
  ProGate: ({ children }: { children: unknown }) => children,
  ProLimit: () => null,
  useIsPro: () => true,
}));
jest.mock("@/lib/needt3/hooks/core", () => ({
  fetchJson: jest.fn(),
  sendJson: jest.fn(() => Promise.resolve({})),
}));
const aiSend = jest.fn();
jest.mock("../../corner/useAskNeedt", () => ({
  useAskNeedt: () => ({
    messages: [],
    phase: "idle",
    send: (...args: unknown[]) => aiSend(...args),
    stop: jest.fn(),
    reset: jest.fn(),
  }),
}));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => ({
    isLoading: false,
    data: [
      {
        provider: "google",
        kind: "calendar",
        state: "connected",
        label: "me@example.com",
        detail: null,
        accountId: "c1",
      },
    ],
  }),
}));

const NOW = new Date().toISOString();
const OVERVIEW = {
  agents: [
    {
      id: "a1",
      name: "Claude",
      kind: "assistant",
      skills: ["writing"],
      connection: "MCP",
      openItems: 1,
      heldItems: 1,
      lastSeenAt: NOW,
      limits: {
        maxInProgress: 2,
        maxClaimsPerDay: null,
        inboxLimit: null,
        acceptsLarge: true,
      },
      token: { preview: "nt_…abcd", revoked: false, lastUsedAt: NOW },
    },
    {
      id: "a2",
      name: "Grok",
      kind: "browser",
      skills: [],
      connection: "MCP",
      openItems: 0,
      heldItems: 0,
      lastSeenAt: null,
      token: null,
    },
    {
      id: "a4",
      name: "Old bot",
      kind: "other",
      skills: [],
      connection: "MCP",
      openItems: 0,
      heldItems: 0,
      lastSeenAt: null,
      disabledAt: NOW,
      disabled: true,
      token: { preview: "nt_…old", revoked: false, lastUsedAt: null },
    },
  ],
  items: [
    {
      id: "i1",
      title: "Draft the launch post",
      status: "in_progress",
      goal: "A post ready to publish",
      doneCriteria: "",
      criteria: [
        { text: "Draft written", met: true },
        { text: "Owner approved", met: null },
      ],
      risks: [],
      approvals: {},
      assignee: { id: "a1", name: "Claude" },
      heldBy: { name: "Claude" },
      leaseExpiresAt: NOW,
      leaseExpired: false,
      question: null,
      noCapableAgent: false,
      ownerUnread: false,
      result: null,
      latestEvent: null,
      updatedAt: NOW,
    },
    {
      id: "i2",
      title: "Pick a cover image",
      status: "needs_owner",
      goal: "One image",
      doneCriteria: "Chosen",
      risks: [],
      approvals: {},
      assignee: { id: "a2", name: "Grok" },
      heldBy: null,
      leaseExpiresAt: null,
      leaseExpired: false,
      question: "Which of the three?",
      noCapableAgent: false,
      ownerUnread: true,
      result: null,
      latestEvent: null,
      updatedAt: NOW,
    },
    {
      id: "i3",
      title: "Collect prices",
      status: "done",
      goal: "A table",
      doneCriteria: "Table in the hub",
      risks: [],
      approvals: {},
      assignee: { id: "a1", name: "Claude" },
      heldBy: null,
      leaseExpiresAt: null,
      leaseExpired: false,
      question: null,
      noCapableAgent: false,
      ownerUnread: false,
      result: { summary: "Prices collected for five shops" },
      latestEvent: null,
      updatedAt: NOW,
    },
  ],
  notes: [
    {
      id: "n1",
      text: "The shop account uses the work email.",
      tags: ["accounts"],
      author: { kind: "agent", name: "Claude" },
      ownerEdited: false,
      updatedAt: NOW,
    },
  ],
  reservations: [],
};
const THREADS = {
  threads: [
    {
      id: "t1",
      subject: "Cover image options",
      itemId: "i2",
      lastMessageAt: NOW,
      ownerUnread: true,
      last: {
        from: "Grok",
        text: "Three options are ready.",
        importance: "normal",
      },
    },
  ],
};
const ACTIVITY = {
  windowDays: 7,
  nextCursor: null,
  events: [
    {
      id: "e1",
      at: NOW,
      kind: "completed",
      type: "completed",
      actor: { kind: "agent", id: "a1", name: "Claude" },
      item: { id: "i3", title: "Collect prices" },
      message: "Five shops",
    },
  ],
};

function route(url: string) {
  if (url.startsWith("/api/agent-hub/overview")) return OVERVIEW;
  if (url.startsWith("/api/agent-hub/messages/"))
    return { thread: { subject: "Cover image options" }, messages: [] };
  if (url.startsWith("/api/agent-hub/messages")) return THREADS;
  if (url.startsWith("/api/agent-hub/activity")) return ACTIVITY;
  if (url.startsWith("/api/agent-hub/recurrences")) return { recurrences: [] };
  if (url.startsWith("/api/agent-hub/webhooks")) return { webhooks: [] };
  return {};
}

let host: HTMLElement;
let root: Root;

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(query = "") {
  search = new URLSearchParams(query);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      h(QueryClientProvider, { client: qc }, h(AgentsScreen as never))
    );
  });
  await settle();
}

const tab = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-ag-tab="${id}"]`)!;
const selected = () =>
  host
    .querySelector('[role="tab"][aria-selected="true"]')
    ?.getAttribute("data-ag-tab");

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

beforeAll(() => {
  // jsdom lays nothing out; give the Map's panel a size so the scene builds.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 1200;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 620;
    },
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  // The setup shows once per device; most tests start past it.
  window.localStorage.setItem("needt:agents-onboarded", "1");
  (fetchJson as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve(route(url))
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Agents screen", () => {
  it("opens on the Map, full window, with the real counts", async () => {
    await mount();
    expect(selected()).toBe("map");
    expect(host.querySelector(".ag-night")).not.toBeNull();
    // No hero over the Map (owner, 05.11.26); the counts sit on its bar.
    expect(host.querySelector(".ag-hero")).toBeNull();
    expect(host.querySelector(".ag-map-stage [data-ag-map]")).not.toBeNull();
    // The overview is asked for the graph in the same request.
    expect(
      (fetchJson as jest.Mock).mock.calls.some(([u]) =>
        String(u).startsWith("/api/agent-hub/overview?graph=1")
      )
    ).toBe(true);
    // Agents with something connected skip the first-visit onboarding.
    expect(host.querySelector("[data-ag-onboarding]")).toBeNull();
    // Claude holds an item in progress: working now. Grok was never seen.
    expect(host.querySelector("[data-ag-status]")?.textContent).toBe(
      "2 agents · 3 tasks this week · 1 working now"
    );
    expect(host.querySelector("[data-ag-map]")).not.toBeNull();
    // Each agent carries a label; the right column holds its latest work.
    expect(host.querySelectorAll(".ag-alab")).toHaveLength(2);
    expect(host.querySelector("[data-ag-map-result]")).not.toBeNull();
    expect(host.querySelector(".ag-map-status-legend")?.textContent).toContain(
      "Needs your reply"
    );
  });

  it("opens an agent's card from the Map", async () => {
    await mount();
    await click(host.querySelector('[data-ag-map-agent="a1"]'));
    expect(selected()).toBe("agents");
    const card = host.querySelector('[data-ag-card="a1"]');
    expect(card?.className).toContain("is-focused");
    expect(card?.getAttribute("data-ag-state")).toBe("working");
  });

  it("opens a finished result as a hub item inside Agents", async () => {
    await mount();
    const pill = host.querySelector<HTMLElement>(
      '[data-ag-map-result="i1"], [data-ag-map-result="i3"]'
    );
    const id = pill?.getAttribute("data-ag-map-result");
    await click(pill);
    expect(selected()).toBe("tasks");
    expect(
      host.querySelector(`[data-ag-focused] [data-ag-item='${id}']`)
    ).not.toBeNull();
  });

  it("lists the Map's task nodes for the keyboard; one opens inside Agents", async () => {
    await mount();
    const btn = host.querySelector<HTMLElement>("[data-ag-map-item]");
    expect(btn).not.toBeNull();
    const id = btn?.getAttribute("data-ag-map-item");
    await click(btn);
    expect(selected()).toBe("tasks");
    expect(
      host.querySelector(`[data-ag-focused] [data-ag-item='${id}']`)
    ).not.toBeNull();
  });

  it("New layout redraws from a new seed; ?seed= pins one", async () => {
    await mount("seed=42");
    const panel = () => host.querySelector("[data-ag-map]");
    expect(panel()?.getAttribute("data-ag-map-seed")).toBe("42");
    await click(host.querySelector("[data-ag-map-shuffle]"));
    expect(panel()?.getAttribute("data-ag-map-seed")).not.toBe("42");
  });

  it("walks every tab by click and checks what each shows", async () => {
    await mount();

    await click(tab("agents"));
    expect(selected()).toBe("agents");
    // The disabled agent stays here, offline, so it can still be revoked.
    expect(host.querySelectorAll("[data-ag-card]")).toHaveLength(3);
    expect(
      host.querySelector('[data-ag-card="a4"]')?.getAttribute("data-ag-state")
    ).toBe("offline");
    expect(host.querySelector("h1")?.textContent).toBe("Agents");
    expect(host.querySelector("[data-ag-new-agent]")).not.toBeNull();
    expect(
      host.querySelector('[data-ag-card="a2"]')?.getAttribute("data-ag-state")
    ).toBe("offline");

    await click(tab("tasks"));
    expect(selected()).toBe("tasks");
    expect(
      host.querySelector("[data-ag-needs-you] [data-ag-item='i2']")
    ).not.toBeNull();
    expect(
      host.querySelector("[data-ag-progress] [data-ag-item='i1']")
    ).not.toBeNull();
    expect(
      host.querySelector("[data-ag-rest] [data-ag-item='i3']")
    ).not.toBeNull();
    expect(
      host.querySelector("[data-ag-item='i1'] .ag-crit")?.textContent
    ).toBe("1/2");

    await click(tab("chat"));
    expect(selected()).toBe("chat");
    expect(host.querySelector('[data-ag-thread="t1"]')?.textContent).toContain(
      "Cover image options"
    );
    expect(host.querySelector('[data-ag-thread="t1"] .ag-un')).not.toBeNull();
    // What agents ask and write arrives in the conversation as cards.
    expect(host.querySelector('[data-ag-ask="i2"]')?.textContent).toContain(
      "Which of the three?"
    );
    expect(host.querySelector('[data-ag-unread="t1"]')).not.toBeNull();

    await click(tab("activity"));
    expect(selected()).toBe("activity");
    expect(
      host.querySelector('[data-ag-event="completed"]')?.textContent
    ).toContain("Claude finished Collect prices");
    expect(host.querySelector(".ag-side")?.textContent).toContain("This week");

    await click(tab("memory"));
    expect(selected()).toBe("memory");
    expect(host.querySelector("[data-memories]")).not.toBeNull();
    expect(host.querySelector('[data-ag-note="n1"]')?.textContent).toContain(
      "work email"
    );

    await click(tab("map"));
    expect(host.querySelector("[data-ag-map]")).not.toBeNull();
  });

  it.each([
    ["agents", "[data-ag-agents]"],
    ["tasks", "[data-ag-tasks]"],
    ["chat", "[data-ag-chat]"],
    ["activity", "[data-ag-activity]"],
    ["memory", "[data-ag-memory]"],
  ])("opens ?tab=%s directly", async (id, selector) => {
    await mount(`tab=${id}`);
    expect(selected()).toBe(id);
    expect(host.querySelector(selector)).not.toBeNull();
  });

  it("moves between tabs with the arrow keys", async () => {
    await mount();
    const list = host.querySelector('[role="tablist"]')!;
    await act(async () => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(selected()).toBe("agents");
    await act(async () => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      );
    });
    expect(selected()).toBe("memory");
    await act(async () => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(selected()).toBe("map");
  });

  it("filters tasks from the sticky bar", async () => {
    await mount("tab=tasks");
    await click(host.querySelector("[data-ag-view-waiting]"));
    expect(host.querySelector("[data-ag-item='i2']")).not.toBeNull();
    expect(host.querySelector("[data-ag-item='i1']")).toBeNull();
    await click(host.querySelector("[data-ag-view-done]"));
    expect(host.querySelector("[data-ag-item='i3']")).not.toBeNull();
    expect(host.querySelector("[data-ag-item='i2']")).toBeNull();
  });

  it("draws the Map without its counts when the graph failed (null)", async () => {
    (fetchJson as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith("/api/agent-hub/overview")
          ? { ...OVERVIEW, graph: null }
          : route(url)
      )
    );
    await mount();
    expect(selected()).toBe("map");
    expect(host.querySelector(".ag-map-stage [data-ag-map]")).not.toBeNull();
  });

  it("asks for the graph only on the tabs that draw it", async () => {
    await mount("tab=tasks");
    const urls = (fetchJson as jest.Mock).mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.startsWith("/api/agent-hub/overview"));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !u.includes("graph=1"))).toBe(true);
  });

  it("deep-links a thread with ?thread=, and old ?tab=messages lands in Chat", async () => {
    await mount("thread=t1");
    expect(selected()).toBe("chat");
    expect(host.querySelector("[data-ag-model]")?.textContent).toBe(
      "Cover image options"
    );
    expect(host.querySelector('[data-ag-thread-item="i2"]')).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    await mount("tab=messages");
    expect(selected()).toBe("chat");
  });

  it("sends the line to Needt AI, and to the thread when one is open", async () => {
    await mount("tab=chat");
    const input = () =>
      host.querySelector<HTMLInputElement>("[data-ag-chat-input]")!;
    const type = async (text: string) => {
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!;
        set.call(input(), text);
        input().dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("What is Claude doing?");
    await click(host.querySelector("[data-ag-chat-send]"));
    expect(aiSend).toHaveBeenCalledWith("What is Claude doing?");

    await click(host.querySelector('[data-ag-thread="t1"]'));
    await type("The second one");
    await click(host.querySelector("[data-ag-chat-send]"));
    const { sendJson } = jest.requireMock("@/lib/needt3/hooks/core");
    expect(sendJson).toHaveBeenCalledWith("/api/agent-hub/messages", "POST", {
      threadId: "t1",
      body: "The second one",
    });
    expect(aiSend).toHaveBeenCalledTimes(1);
  });

  it("drops a deep link when you leave its tab", async () => {
    window.history.replaceState(null, "", "/agents?thread=t1");
    await mount("thread=t1");
    await click(tab("map"));
    const url = new URL(window.location.href);
    expect(url.searchParams.get("thread")).toBeNull();
    expect(url.searchParams.get("tab")).toBeNull();
  });

  it("shows an item opened from the map once, at the top", async () => {
    await mount("item=i1");
    expect(selected()).toBe("tasks");
    expect(host.querySelectorAll("[data-ag-item='i1']")).toHaveLength(1);
    expect(
      host.querySelector("[data-ag-focused] [data-ag-item='i1']")
    ).not.toBeNull();
  });

  it("opens the setup on a first visit, and Not now leaves it", async () => {
    window.localStorage.clear();
    (fetchJson as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith("/api/agent-hub/overview")
          ? { ...OVERVIEW, agents: [], items: [], notes: [] }
          : route(url)
      )
    );
    await mount();
    expect(host.querySelector("[data-ag-onboarding]")).not.toBeNull();
    await click(host.querySelector("[data-ag-onboard-skip]"));
    expect(host.querySelector("[data-ag-onboarding]")).toBeNull();
    expect(window.localStorage.getItem("needt:agents-onboarded")).toBe("1");
  });

  it("asks the server for a tag's notes", async () => {
    await mount("tab=memory");
    await click(
      Array.from(host.querySelectorAll(".ag-chip")).find((b) =>
        b.textContent?.startsWith("accounts")
      ) ?? null
    );
    expect(
      (fetchJson as jest.Mock).mock.calls.some(([u]) =>
        String(u).includes("&tag=accounts")
      )
    ).toBe(true);
  });
});
