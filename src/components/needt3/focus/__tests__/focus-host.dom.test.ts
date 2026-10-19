/**
 * @jest-environment jsdom
 *
 * The Focus window, mounted for real over a seeded cache and a fake server:
 * one controller above the desktop / phone switch, so the session, the clock,
 * the form and the End view all survive crossing 700 px; Start, Pause, +5,
 * End session (one press, one confirm, no wait), the clock running out, the tab title and the
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
const info = jest.fn();
const complete = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => success(...a),
    error: (...a: unknown[]) => error(...a),
    info: (...a: unknown[]) => info(...a),
    warning: jest.fn(),
  },
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({
  ...jest.requireActual("@/lib/needt3/hooks/tasks"),
  useUpdateTask: () => ({
    mutateAsync: (...a: unknown[]) => complete(...a),
  }),
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
let strictStop = false;
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
        if (strictStop)
          return Promise.resolve({
            ok: false,
            status: 409,
            statusText: "Conflict",
            text: async () => JSON.stringify({ error: "EXIT_DELAY_REQUIRED" }),
          });
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
  complete.mockImplementation(async ({ id }: { id: string }) => {
    qc.setQueryData(qk.tasks({}), (list: V3Task[] | undefined) =>
      (list ?? []).map((t) =>
        t.id === id ? ({ ...t, done: true, status: "completed" } as V3Task) : t
      )
    );
    return { result: {}, undo: jest.fn() };
  });
  window.history.replaceState({}, "", "/today");
  server = null;
  strictStop = false;
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

  it("End session is always on the controls and asks once, with the minutes so far", async () => {
    await begin();
    await tick(90_000);
    expect(q("[data-fc-stop]")!.textContent).toContain("End session");
    expect(q<HTMLButtonElement>("[data-fc-stop]")!.disabled).toBe(false);
    await click("[data-fc-stop]");
    expect(posts("request-stop")).toHaveLength(0);
    expect(posts("stop")).toHaveLength(0);
    expect(q("[data-fc-confirm]")!.textContent).toContain(
      "End now? 2 min focused so far."
    );
  });

  it("ends early in one step: confirm, no wait, honest minutes", async () => {
    await begin();
    await tick(7 * 60 * 1000);
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
    expect(posts("request-stop")).toHaveLength(0);
    expect(posts("stop")).toHaveLength(1);
    expect(posts("stop")[0].body).toMatchObject({
      sessionId: "s1",
      completed: false,
    });
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("end");
    expect(q(".px-kicker")!.textContent).toBe("Session ended");
    expect(q(".fc-title")!.textContent).toBe("7 min");
    expect(document.title).toBe("Today | Needt");
    expect(q("[data-fc-stats]")!.textContent).toContain("42 min");
    expect(qc.getQueryData(qk.focusSession())).toBeNull();
  });

  it("under a minute says so", async () => {
    await begin();
    await tick(2000);
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
    expect(q(".fc-title")!.textContent).toBe("Under a minute");
    expect(document.title).toBe("Today | Needt");
  });

  it("Keep going and Esc back out of the confirm without ending or minimising", async () => {
    await begin();
    await click("[data-fc-stop]");
    await click("[data-fc-end-cancel]");
    expect(q("[data-fc-confirm]")).toBeNull();
    await click("[data-fc-stop]");
    expect(q("[data-fc-confirm]")).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(q("[data-fc-confirm]")).toBeNull();
    expect(useNeedt3Ui.getState().focusOpen).toBe(true);
    expect(posts("stop")).toHaveLength(0);
    // a second Esc, with nothing to back out of, minimises
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(useNeedt3Ui.getState().focusOpen).toBe(false);
  });

  it("pausing, +5 or the face swap keep the session while the confirm is open", async () => {
    await begin();
    await click("[data-fc-stop]");
    await click("[data-fc-pause]");
    expect(q("[data-fc-confirm]")).toBeNull();
    expect(posts("pause")).toHaveLength(1);
    await click("[data-fc-stop]");
    await mount("phone");
    expect(q("[data-fc-confirm]")).not.toBeNull();
    expect(posts("stop")).toHaveLength(0);
  });

  it("a paused session ends with the minutes before the pause", async () => {
    await begin();
    await tick(4 * 60 * 1000);
    await click("[data-fc-pause]");
    await tick(30 * 60 * 1000);
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
    expect(q(".fc-title")!.textContent).toBe("4 min");
  });

  it("a strict (Pro) session that still holds the stop says so and stays running", async () => {
    await begin();
    strictStop = true;
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
    expect(posts("stop")).toHaveLength(1);
    expect(posts("request-stop")).toHaveLength(1);
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("run");
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
    await click("[data-fc-end-confirm]");
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

  it("a break ends at once, without a confirm", async () => {
    await mount();
    await open();
    await click("[data-fc-start]");
    await tick(1000);
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
    await click("[data-fc-next='break']");
    expect(q("[data-fc-stop]")!.textContent).toContain("End break");
    await click("[data-fc-stop]");
    expect(posts("stop")).toHaveLength(2);
    expect(q("[data-fc-confirm]")).toBeNull();
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("setup");
    expect(document.title).toBe("Today | Needt");
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

describe("a reload in the middle of a session", () => {
  const seed = (startedMinAgo: number, planned = 25) => {
    server = {
      id: "s9",
      taskId: "t1",
      intention: "Write the brief",
      plannedMinutes: planned,
      startedAt: new Date(NOW.getTime() - startedMinAgo * 60_000).toISOString(),
      pausedAt: null,
      pausedTotalSeconds: 0,
      phase: "FOCUS",
    };
    qc.setQueryData(qk.focusSession(), server);
  };

  it("picks the clock up where the server has it, and ends early from there", async () => {
    seed(10);
    await mount();
    await open();
    expect(clock()).toBe("15:00");
    expect(document.title).toBe("15:00 · Today | Needt");
    await click("[data-fc-stop]");
    expect(q("[data-fc-confirm]")!.textContent).toContain("10 min focused");
    await click("[data-fc-end-confirm]");
    expect(q(".fc-title")!.textContent).toBe("10 min");
    expect(document.title).toBe("Today | Needt");
  });

  it("closes a session found long past its end quietly, with one notice", async () => {
    seed(180);
    await mount();
    await tick(10);
    expect(posts("stop")).toHaveLength(1);
    expect(posts("stop")[0].body).toMatchObject({ completed: true });
    expect(useNeedt3Ui.getState().focusOpen).toBe(false);
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0]).toBe(
      "Focus session ended \u00b7 25 min on \u201cWrite the brief\u201d"
    );
    expect(document.title).toBe("Today | Needt");
    expect(qc.getQueryData(qk.focusSession())).toBeNull();
  });
});

describe("Done with <task>?", () => {
  const run = async (minutes = "25") => {
    await mount();
    await open();
    await click(`[data-fc-seg='${minutes}']`);
    await click("[data-fc-start]");
  };
  const ranOut = async () => {
    await run();
    await tick(25 * 60 * 1000 + 1000);
  };
  const stopEarly = async () => {
    await run();
    await tick(2000);
    await click("[data-fc-stop]");
    await click("[data-fc-end-confirm]");
  };

  it("asks when the clock runs out on a task, with Done, Not yet and +15 min", async () => {
    await ranOut();
    expect(q("[data-fc-done-ask] .fc-end-line")!.textContent).toBe(
      "Done with Write the brief?"
    );
    expect(q("[data-fc-done]")!.textContent).toBe("Done");
    expect(q("[data-fc-not-yet]")!.textContent).toBe("Not yet");
    expect(q("[data-fc-more-focus]")!.textContent).toBe("+15 min");
    expect(document.activeElement).toBe(q("[data-fc-done]"));
  });

  it("Done completes the task and says so with an Undo", async () => {
    await ranOut();
    await click("[data-fc-done]");
    await tick(10);
    expect(complete).toHaveBeenCalledWith({ id: "t1", patch: { done: true } });
    expect(success).toHaveBeenCalledWith(
      "Done · Write the brief",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
    expect(q("[data-fc-done-ask]")).toBeNull();
  });

  it("an early stop asks too, but without +15 min", async () => {
    await stopEarly();
    expect(q("[data-fc-done-ask]")).not.toBeNull();
    expect(q("[data-fc-more-focus]")).toBeNull();
  });

  it("+15 min starts another session on the same task", async () => {
    await ranOut();
    await click("[data-fc-more-focus]");
    expect(posts("start")[1].body).toMatchObject({
      taskId: "t1",
      plannedMinutes: 15,
      phase: "FOCUS",
    });
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("run");
    expect(clock()).toBe("15:00");
  });

  it("Not yet puts the question away and does not nag on close", async () => {
    await ranOut();
    await click("[data-fc-not-yet]");
    expect(q("[data-fc-done-ask]")).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    await click("[data-fc-action='close']");
    expect(info).not.toHaveBeenCalled();
  });

  it("leaving without answering keeps the question once, as a notice with Done", async () => {
    await ranOut();
    await click("[data-fc-action='close']");
    await tick(300);
    expect(q("[data-fc-window]")).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      "Done with Write the brief?",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Done" }),
      })
    );
    const action = info.mock.calls[0][1].action as { onClick: () => void };
    await act(async () => action.onClick());
    expect(complete).toHaveBeenCalledWith({ id: "t1", patch: { done: true } });
  });

  it("does not ask when the task is already completed", async () => {
    await run();
    qc.setQueryData(qk.tasks({}), [
      task("t1", "Write the brief", { done: true, status: "completed" }),
      task("t2", "Review the budget"),
    ]);
    await tick(25 * 60 * 1000 + 1000);
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("end");
    expect(q("[data-fc-done-ask]")).toBeNull();
  });

  it("does not ask for a session that was not on a task", async () => {
    await mount();
    await open();
    useFocusWindow.getState().patch({
      draft: { purpose: "Think", len: "25", custom: "", taskId: "" },
    });
    await click("[data-fc-start]");
    await tick(25 * 60 * 1000 + 1000);
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("end");
    expect(q("[data-fc-done-ask]")).toBeNull();
    await click("[data-fc-action='close']");
    expect(info).not.toHaveBeenCalled();
  });

  it("a Focus-ended push link opens straight on the ask, on the phone too", async () => {
    window.history.replaceState({}, "", "/today?focusDone=t2&x=1");
    await mount("phone");
    expect(window.location.search).toBe("?x=1");
    expect(q("[data-fc-window]")?.getAttribute("data-fc-window")).toBe("end");
    expect(q("[data-fc-done-ask] .fc-end-line")!.textContent).toBe(
      "Done with Review the budget?"
    );
    await click("[data-fc-done]");
    expect(complete).toHaveBeenCalledWith({ id: "t2", patch: { done: true } });
  });

  it("a push link for a finished or unknown task shows nothing", async () => {
    window.history.replaceState({}, "", "/today?focusDone=nope");
    await mount();
    expect(window.location.search).toBe("");
    expect(q("[data-fc-window]")).toBeNull();
  });
});
