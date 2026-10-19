/**
 * @jest-environment jsdom
 *
 * The whole game with a mocked network: the three questions, ONE agent
 * request after the third, the board, ONE create, the summary, Plan my day and
 * its Undo. And the ways it fails without losing anything.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { notify } from "@/lib/notifications";

import { openPaywall } from "../../paywall/store";
import { SgGame } from "../SgGame";

jest.mock("../../orb/AiOrb", () => ({ AiOrb: () => null }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("../../paywall/store", () => ({ openPaywall: jest.fn() }));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PLAN = {
  status: "ready",
  items: [
    {
      title: "Call Anna",
      kind: "task",
      suggestedGroup: "today",
      durationMinutes: 15,
    },
    {
      title: "Write report",
      kind: "task",
      suggestedGroup: "week",
      durationMinutes: 60,
    },
    { title: "Duolingo", kind: "habit", suggestedGroup: "habit", perWeek: 7 },
    {
      title: "German course",
      kind: "project",
      suggestedGroup: "project",
      horizon: "this quarter",
      firstStep: "Book the test",
    },
  ],
  suggestions: {},
};
const CREATED = {
  result: {
    counts: { tasks: 2, habits: 1, projects: 1 },
    tasks: [
      { id: "k1", title: "Call Anna", group: "today" },
      { id: "k2", title: "Write report", group: "week" },
    ],
    habits: [{ id: "h1", title: "Duolingo" }],
    projects: [{ id: "p1", name: "German course", firstStepTaskId: "k3" }],
  },
  actionId: "act-1",
  undoable: true,
  undoableUntil: null,
};
const PLANNED = {
  placed: 2,
  moved: 0,
  unplaced: [],
  items: [
    {
      taskId: "k1",
      title: "Call Anna",
      day: "Today",
      time: "09:00–09:15",
      moved: false,
    },
    {
      taskId: "k3",
      title: "Book the test",
      day: "Tomorrow",
      time: "10:00–10:30",
      moved: false,
    },
  ],
  headline: "Placed 2 tasks",
  actionId: "plan-1",
  undoable: true,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let routes: Record<string, () => { status: number; body: unknown }>;
let calls: Array<{ url: string; body: unknown }>;
let onClose: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  calls = [];
  routes = {
    "/api/starter-game/plan": () => ({ status: 200, body: PLAN }),
    "/api/starter-game/create": () => ({ status: 200, body: CREATED }),
    "/api/ai/plan-day": () => ({ status: 200, body: PLANNED }),
    "/api/agent/actions/plan-1/undo": () => ({
      status: 200,
      body: { status: "undone" },
    }),
    "/api/agent/actions/act-1/undo": () => ({
      status: 200,
      body: { status: "undone" },
    }),
  };
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const r = routes[url]?.() ?? { status: 404, body: { error: "no route" } };
      return {
        ok: r.status < 400,
        status: r.status,
        statusText: "",
        text: async () => JSON.stringify(r.body),
      };
    }
  );
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  onClose = jest.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const draw = () =>
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(SgGame, { entry: "home", phone: false, onClose })
      )
    )
  );
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const press = (sel: string) => act(() => q(sel)?.click());
const chip = (label: string) =>
  act(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(".sg-chip"))
      .find((c) => c.textContent?.includes(label))
      ?.click()
  );
const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => Promise.resolve());
};
const next = async () => {
  press('[data-sg="continue"]');
  await act(async () => {
    jest.advanceTimersByTime(800);
  });
};
const planCalls = () => calls.filter((c) => c.url === "/api/starter-game/plan");
const createCalls = () =>
  calls.filter((c) => c.url === "/api/starter-game/create");

async function throughChat() {
  draw();
  chip("Work");
  await next();
  press('[data-sg="example"]');
  await next();
  chip("Duolingo daily");
  press('[data-sg="continue"]');
  await flush();
}

describe("the chat", () => {
  it("asks three questions, then makes ONE agent request with the answers", async () => {
    draw();
    expect(q("[data-sg-chat]")?.textContent).toContain(
      "What do you spend your days on?"
    );
    expect(q('[data-sg="continue"]')?.hasAttribute("disabled")).toBe(true);
    chip("Work");
    chip("Study");
    await next();
    expect(q("[data-sg-chat]")?.textContent).toContain("Work, Study");
    expect(q("[data-sg-chat]")?.textContent).toContain(
      "What’s burning this week?"
    );
    press('[data-sg="example"]');
    expect(q("textarea")?.getAttribute("aria-label")).toBe(
      "What’s burning this week?"
    );
    expect((q("textarea") as HTMLTextAreaElement).value).toMatch(
      /Product launch/
    );
    await next();
    expect(planCalls()).toHaveLength(0);
    chip("Duolingo daily");
    press('[data-sg="continue"]');
    await flush();

    expect(planCalls()).toHaveLength(1);
    expect(planCalls()[0].body).toEqual({
      do: "Work, Study",
      burn: expect.stringContaining("language homework"),
      reg: "Duolingo daily",
    });
    expect(q("[data-sg-board]")).not.toBeNull();
    expect(q(".sg-steps")?.getAttribute("aria-label")).toBe("Step 2 of 3");
  });

  it("thinks while the request is out", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const original = (globalThis as { fetch: typeof fetch }).fetch;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(
      async (url: string, init?: RequestInit) => {
        if (url === "/api/starter-game/plan") await gate;
        return original(url, init);
      }
    );
    draw();
    chip("Work");
    await next();
    press('[data-sg="example"]');
    await next();
    chip("Journal");
    press('[data-sg="continue"]');
    await flush();
    expect(q(".sg-typing")).not.toBeNull();
    expect(q("[data-sg-board]")).toBeNull();
    release();
    await flush();
    expect(q("[data-sg-board]")).not.toBeNull();
  });

  it("says so and offers Try again when the agent cannot answer; nothing is made up", async () => {
    routes["/api/starter-game/plan"] = () => ({
      status: 200,
      body: { status: "unavailable", items: [], suggestions: {} },
    });
    await throughChat();
    expect(q("[data-sg-failed]")).not.toBeNull();
    expect(q("[data-sg-board]")).toBeNull();

    routes["/api/starter-game/plan"] = () => ({ status: 200, body: PLAN });
    press('[data-sg="retry"]');
    await flush();
    expect(planCalls()).toHaveLength(2);
    expect(q("[data-sg-board]")).not.toBeNull();
  });

  it("treats a failed request the same way", async () => {
    routes["/api/starter-game/plan"] = () => ({
      status: 500,
      body: { error: "boom" },
    });
    await throughChat();
    expect(q("[data-sg-failed]")).not.toBeNull();
  });

  it("sends a Free account to the plans", async () => {
    routes["/api/starter-game/plan"] = () => ({
      status: 200,
      body: { status: "upgrade", items: [], suggestions: {} },
    });
    await throughChat();
    expect(openPaywall).toHaveBeenCalledWith("Starter game");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes with the button and with Escape", async () => {
    draw();
    press('[data-sg="close"]');
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("dictation", () => {
  const originalSpeech = (window as unknown as Record<string, unknown>)
    .webkitSpeechRecognition;
  afterEach(() => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      originalSpeech;
  });

  it("has no mic where the browser cannot listen", async () => {
    draw();
    chip("Work");
    await next();
    expect(q('[data-sg="dictate"]')).toBeNull();
  });

  it("types what the browser heard into the field", async () => {
    let instance: {
      onresult: ((e: unknown) => void) | null;
      onend: (() => void) | null;
    } | null = null;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      class {
        lang = "";
        continuous = false;
        interimResults = false;
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          instance = this;
        }
        start() {}
        stop() {
          this.onend?.();
        }
        abort() {}
      };
    draw();
    chip("Work");
    await next();
    expect(q('[data-sg="dictate"]')).not.toBeNull();
    press('[data-sg="dictate"]');
    expect(q('[data-sg="dictate"]')?.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "call Anna on Friday" } }],
      });
    });
    expect((q("textarea") as HTMLTextAreaElement).value).toBe(
      "call Anna on Friday"
    );
    press('[data-sg="dictate"]');
    expect(q('[data-sg="dictate"]')?.getAttribute("aria-pressed")).toBe(
      "false"
    );
  });
});

describe("create, summary and Plan my day", () => {
  async function toSummary() {
    await throughChat();
    press('[data-sg="sort-rest"]');
    await act(async () => {
      jest.advanceTimersByTime(110 * 4);
    });
    press('[data-sg="create"]');
    await flush();
  }

  it("creates everything with ONE request and shows the summary", async () => {
    await toSummary();
    expect(createCalls()).toHaveLength(1);
    expect(createCalls()[0].body).toEqual({
      tasks: [
        { title: "Call Anna", group: "today", estimateMinutes: 15 },
        { title: "Write report", group: "week", estimateMinutes: 60 },
      ],
      habits: [{ title: "Duolingo", perWeek: 7 }],
      projects: [
        {
          name: "German course",
          firstStep: "Book the test",
          horizon: "this quarter",
        },
      ],
    });
    expect(q('[data-sg-sum="done"]')).not.toBeNull();
    expect(q(".sg-counts")?.textContent).toContain("2");
    expect(q(".sg-sum-list")?.textContent).toContain("Call Anna");
    expect(q(".sg-steps")?.getAttribute("aria-label")).toBe("Step 3 of 3");
  });

  it("offers the single Undo in a toast, which brings the sorted board back", async () => {
    await toSummary();
    const [message, options] = (notify.success as jest.Mock).mock.calls[0];
    expect(message).toBe("Created 2 tasks, 1 habit, 1 project");
    expect(options.action.label).toBe("Undo");
    await act(async () => {
      options.action.onClick();
    });
    await flush();
    expect(calls.some((c) => c.url === "/api/agent/actions/act-1/undo")).toBe(
      true
    );
    expect(q("[data-sg-board]")).not.toBeNull();
    expect(q('[data-sg-sum="done"]')).toBeNull();
  });

  it("Plan my day calls the existing route and shows where tasks went, with Undo", async () => {
    await toSummary();
    press('[data-sg="plan-day"]');
    await flush();
    expect(calls.filter((c) => c.url === "/api/ai/plan-day")).toHaveLength(1);
    const planned = q('[data-sg-sum="planned"]')!;
    expect(planned.textContent).toContain("planned.");
    expect(planned.textContent).toContain(
      "Placed 2 tasks. Nothing else moved."
    );
    expect(planned.textContent).toContain("Call Anna");
    expect(planned.textContent).toContain("09:00");
    expect(planned.textContent).toContain("Tomorrow");

    press('[data-sg="undo-plan"]');
    await flush();
    expect(calls.some((c) => c.url === "/api/agent/actions/plan-1/undo")).toBe(
      true
    );
    expect(q('[data-sg-sum="done"]')).not.toBeNull();
  });

  it("does not claim 'nothing else moved' when the plan moved something", async () => {
    routes["/api/ai/plan-day"] = () => ({
      status: 200,
      body: { ...PLANNED, moved: 1, headline: "Placed 1 task, moved 1" },
    });
    await toSummary();
    press('[data-sg="plan-day"]');
    await flush();
    expect(q('[data-sg-sum="planned"]')?.textContent).not.toContain(
      "Nothing else moved"
    );
  });

  it("tells the person when planning is refused and stays on the summary", async () => {
    routes["/api/ai/plan-day"] = () => ({
      status: 403,
      body: { error: "Plan my day is available on Needt Pro and Lifetime." },
    });
    await toSummary();
    press('[data-sg="plan-day"]');
    await flush();
    expect(notify.error).toHaveBeenCalledWith(
      "Plan my day is available on Needt Pro and Lifetime."
    );
    expect(q('[data-sg-sum="done"]')).not.toBeNull();
  });

  it("Later closes the game: everything is already created", async () => {
    await toSummary();
    press('[data-sg="later"]');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createCalls()).toHaveLength(1);
  });

  it("keeps the board when creating fails, and opens the plans on a 403", async () => {
    routes["/api/starter-game/create"] = () => ({
      status: 500,
      body: { error: "x" },
    });
    await throughChat();
    press('[data-sg="sort-rest"]');
    await act(async () => {
      jest.advanceTimersByTime(110 * 4);
    });
    press('[data-sg="create"]');
    await flush();
    expect(notify.error).toHaveBeenCalledWith(
      "Could not create that. Nothing was changed."
    );
    expect(q("[data-sg-board]")).not.toBeNull();

    routes["/api/starter-game/create"] = () => ({
      status: 403,
      body: { error: "up", code: "UPGRADE_REQUIRED" },
    });
    press('[data-sg="create"]');
    await flush();
    expect(openPaywall).toHaveBeenCalledWith("Starter game");
  });
});
