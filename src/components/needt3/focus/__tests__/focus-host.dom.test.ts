/**
 * @jest-environment jsdom
 *
 * The Focus window, mounted for real over a seeded cache and a fake server:
 * one controller above the desktop / phone switch, so the session, the clock,
 * the form and the End view all survive crossing 700 px; Start, Pause, +5,
 * the two-press early Stop, the clock running out, the tab title and the
 * quick start's notice.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3Task } from "@/lib/needt3/map";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { qk } from "@/lib/needt3/query-keys";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { V3PortalScope } from "../../ctx/PortalScope";
import { PhoneUiProvider } from "../../root/phone-ui-context";
import { FocusHost } from "../FocusHost";
import { useFocusWindow } from "../store";
import { useStartFocus } from "../useFocusController";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const success = jest.fn();
const error = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => success(...a),
    error: (...a: unknown[]) => error(...a),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const NOW = new Date("2026-10-14T10:00:00Z");

const task = (id: string, title: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    estimatedMinutes: 30,
    noSlot: false,
    trashedAt: null,
    parts: [],
    waits: [],
    updatedAt: null,
    ...over,
  }) as unknown as V3Task;

interface Row {
  id: string;
  taskId: string | null;
  intention: string | null;
  plannedMinutes: number | null;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSeconds: number;
  phase: string;
}

let server: Row | null;
let calls: { url: string; body: Record<string, unknown> | null }[];
let host: HTMLDivElement;
let root: Root;
let qc: QueryClient;

const reply = (x: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  text: async () => JSON.stringify(x),
});

function fakeFetch(url: string, init?: RequestInit) {
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ url, body });
  if (url === "/api/focus/session" && init?.method === "POST") {
    const now = new Date().toISOString();
    switch (body.action) {
      case "start":
        server = {
          id: "s1",
          taskId: body.taskId,
          intention: body.intention,
          plannedMinutes: body.plannedMinutes,
          startedAt: now,
          pausedAt: null,
          pausedTotalSeconds: 0,
          phase: body.phase,
        };
        return Promise.resolve(reply({ session: server }));
      case "pause":
        server = { ...server!, pausedAt: now };
        return Promise.resolve(reply({ session: server }));
      case "resume":
        server = { ...server!, pausedAt: null };
        return Promise.resolve(reply({ session: server }));
      case "extend":
        server = {
          ...server!,
          plannedMinutes: (server!.plannedMinutes ?? 0) + body.minutes,
        };
        return Promise.resolve(reply({ session: server }));
      case "request-stop":
        return Promise.resolve(
          reply({
            readyAt: new Date(Date.now() + 5000).toISOString(),
            waitSeconds: 5,
          })
        );
      case "stop":
        server = null;
        return Promise.resolve(reply({ session: {} }));
    }
  }
  if (url.startsWith("/api/focus"))
    return Promise.resolve(
      reply({
        stats: { currentStreak: 2 },
        weeklyReport: {
          sessionsCompleted: 3,
          dailyMinutes: [{ minutes: 0 }, { minutes: 42 }],
        },
      })
    );
  return Promise.resolve(reply(null));
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  server = null;
  calls = [];
  document.title = "Today | Needt";
  (globalThis as { fetch?: unknown }).fetch = jest.fn(fakeFetch);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  qc.setQueryData(qk.tasks({}), [
    task("t1", "Write the brief", {
      parts: [{ id: "p1", title: "Outline", done: false }],
    }),
    task("t2", "Review the budget"),
  ]);
  qc.setQueryData(qk.projects(), []);
  qc.setQueryData(qk.settings(), {
    theme: "system",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: {},
  });
  qc.setQueryData(qk.focusSession(), null);
  useFocusWindow.getState().reset();
  useNeedt3Ui.setState({ focusOpen: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Starter() {
  const start = useStartFocus();
  return h(
    "button",
    {
      "data-quick": "",
      onClick: () => void start({ id: "t1", title: "Write the brief" }),
    },
    "go"
  );
}

const mount = (ui: PhoneUi = "desktop") =>
  act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          V3PortalScope,
          null,
          h(PhoneUiProvider, { value: ui }, h(FocusHost), h(Starter))
        )
      )
    );
  });
const q = <T extends Element>(sel: string) =>
  document.body.querySelector<T>(sel);
const click = (sel: string) =>
  act(async () => {
    q<HTMLElement>(sel)!.click();
  });
const tick = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const open = () => act(() => useNeedt3Ui.getState().setFocusOpen(true));
const clock = () => q("[data-fc-clock]")?.textContent;
const posts = (action: string) =>
  calls.filter((c) => c.body?.action === action);

describe("setup", () => {
  it("draws nothing while shut, then the setup on the sky", async () => {
    await mount();
    expect(q("[data-fc-window]")).toBeNull();
    await open();
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("setup");
    expect(q("[data-fc-task='t1']")).not.toBeNull();
    expect(q("[data-fc-start]")?.textContent).toContain("Start 50 min");
    expect(q(".px-sky")).not.toBeNull();
  });

  it("starts on the chosen task and length, then shows the clock", async () => {
    await mount();
    await open();
    await click("[data-fc-seg='25']");
    await click("[data-fc-start]");
    expect(posts("start")).toHaveLength(1);
    expect(posts("start")[0].body).toMatchObject({
      taskId: "t1",
      plannedMinutes: 25,
      intention: "Write the brief",
      phase: "FOCUS",
    });
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("run");
    expect(clock()).toBe("25:00");
    expect(q("[data-fc-taskcard='t1']")).not.toBeNull();
  });

  it("refuses a custom length outside 1..240", async () => {
    await mount();
    await open();
    await click("[data-fc-seg='custom']");
    const input = q<HTMLInputElement>("[data-fc-custom]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "300");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(q<HTMLButtonElement>("[data-fc-start]")!.disabled).toBe(true);
    expect(q(".fc-error")).not.toBeNull();
  });
});

describe("running", () => {
  const begin = async (ui: PhoneUi = "desktop") => {
    await mount(ui);
    await open();
    await click("[data-fc-seg='25']");
    await click("[data-fc-start]");
  };

  it("counts down and carries the clock in the tab title", async () => {
    await begin();
    await tick(3000);
    expect(clock()).toBe("24:57");
    expect(document.title).toBe("24:57 · Today | Needt");
  });

  it("survives the face swap: same session, same clock, same form", async () => {
    await mount();
    await open();
    const purpose = q<HTMLInputElement>("[data-fc-purpose]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(purpose, "the first draft");
      purpose.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await mount("phone");
    expect(q(".fc-phone")).not.toBeNull();
    expect(q<HTMLInputElement>("[data-fc-purpose]")!.value).toBe(
      "the first draft"
    );
    await click("[data-fc-start]");
    expect(posts("start")[0].body).toMatchObject({
      intention: "the first draft",
    });
    await tick(5000);
    const before = clock();
    await mount("desktop");
    expect(q(".fc-phone")).toBeNull();
    expect(q(".fc-window")).not.toBeNull();
    expect(clock()).toBe(before);
    expect(posts("start")).toHaveLength(1);
    await tick(2000);
    expect(clock()).not.toBe(before);
  });

  it("pauses and resumes on the server and freezes the clock", async () => {
    await begin();
    await tick(10_000);
    await click("[data-fc-pause]");
    expect(posts("pause")).toHaveLength(1);
    const frozen = clock();
    await tick(20_000);
    expect(clock()).toBe(frozen);
    expect(q("[data-fc-clock]")!.className).toContain("is-paused");
    await click("[data-fc-pause]");
    expect(posts("resume")).toHaveLength(1);
  });

  it("adds five minutes", async () => {
    await begin();
    await click("[data-fc-more]");
    expect(posts("extend")[0].body).toMatchObject({ minutes: 5 });
    await tick(10);
    expect(clock()).toBe("30:00");
  });

  it("ends early in two presses, a few seconds apart", async () => {
    await begin();
    await tick(2000);
    await click("[data-fc-stop]");
    expect(posts("request-stop")).toHaveLength(1);
    expect(q("[data-fc-stop]")!.textContent).toContain("Stop in 5");
    expect(q<HTMLButtonElement>("[data-fc-stop]")!.disabled).toBe(true);
    expect(posts("stop")).toHaveLength(0);
    await tick(5000);
    expect(q("[data-fc-stop]")!.textContent).toContain("End session");
    await click("[data-fc-stop]");
    expect(posts("stop")).toHaveLength(1);
    expect(posts("stop")[0].body).toMatchObject({
      sessionId: "s1",
      completed: false,
    });
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("end");
    expect(q(".fc-title")!.textContent).toBe("Under a minute");
    expect(document.title).toBe("Today | Needt");
    expect(q("[data-fc-stats]")!.textContent).toContain("42 min");
  });

  it("minimising folds the window away and the session goes on", async () => {
    await begin();
    await click("[data-fc-action='minimise']");
    await tick(300);
    expect(useNeedt3Ui.getState().focusOpen).toBe(false);
    expect(q("[data-fc-window]")).toBeNull();
    await tick(3000);
    expect(document.title).toMatch(/^24:5\d · /);
    await open();
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("run");
  });
});

describe("the clock runs out", () => {
  it("completes the session and shows the End view", async () => {
    await mount();
    await open();
    await click("[data-fc-seg='25']");
    await click("[data-fc-start]");
    await tick(25 * 60 * 1000 + 1000);
    expect(posts("stop")).toHaveLength(1);
    expect(posts("stop")[0].body).toMatchObject({ completed: true });
    const w = q("[data-fc-window]")!;
    expect(w.getAttribute("data-fc-window")).toBe("end");
    expect(q(".px-kicker")!.textContent).toBe("Session complete");
    expect(q(".fc-title")!.textContent).toBe("25 min");
  });

  it("a break ends back in setup, on the next task", async () => {
    await mount();
    await open();
    await click("[data-fc-start]");
    await tick(1000);
    await click("[data-fc-stop]");
    await tick(5000);
    await click("[data-fc-stop]");
    await click("[data-fc-next='break']");
    expect(posts("start")[1].body).toMatchObject({
      phase: "SHORT_BREAK",
      plannedMinutes: 5,
    });
    expect(q(".fc-card-note")).not.toBeNull();
    await tick(5 * 60 * 1000 + 1000);
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("setup");
    expect(q(".fc-sub")!.textContent).toContain("Break’s over");
  });
});

describe("a quick start", () => {
  it("starts 25 minutes, opens the window on its clock and says so once", async () => {
    await mount();
    await click("[data-quick]");
    expect(posts("start")[0].body).toMatchObject({
      taskId: "t1",
      plannedMinutes: 25,
      intention: "Write the brief",
    });
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0]).toBe(
      "Focus started · 25 min on “Write the brief”"
    );
    expect(useNeedt3Ui.getState().focusOpen).toBe(true);
    expect(clock()).toBe("25:00");
  });

  it("does not replace a session that is already running", async () => {
    await mount();
    await click("[data-quick]");
    await act(async () => {
      useNeedt3Ui.getState().setFocusOpen(false);
    });
    await click("[data-quick]");
    expect(posts("start")).toHaveLength(1);
    expect(success).toHaveBeenCalledTimes(1);
    expect(useNeedt3Ui.getState().focusOpen).toBe(true);
  });

  it("says nothing and starts nothing when the server refuses", async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      statusText: "Conflict",
      text: async () => JSON.stringify({ error: "ACTIVE_FOCUS_SESSION" }),
    }));
    await mount();
    await click("[data-quick]");
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("A focus session is already running.");
    expect(useNeedt3Ui.getState().focusOpen).toBe(false);
  });
});
