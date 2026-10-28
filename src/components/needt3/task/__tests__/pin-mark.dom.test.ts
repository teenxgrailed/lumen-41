/**
 * @jest-environment jsdom
 *
 * A pinned task wears a quiet pin in every layout; an unpinned one wears none.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { Task } from "../Task";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

const task = {
  id: "a",
  title: "Write the brief",
  done: false,
  status: "todo",
  projectId: null,
  dueDate: null,
  estimatedMinutes: 45,
  scheduledStart: "2026-10-16T14:00",
  scheduledEnd: "2026-10-16T14:45",
  isFixed: true,
  auto: false,
  priority: "medium",
  entry: null,
  parts: [],
  waits: [],
} as unknown as V3Task;

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = () => new Promise(() => {});
  client = new QueryClient();
  client.setQueryData(qk.projects(), []);
  client.setQueryData(qk.settings(), {
    theme: "light",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: {},
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as { fetch?: unknown }).fetch;
});

function mount(t: V3Task, props: Record<string, unknown>) {
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(Task, { task: t, today: "2026-10-16", ...props })
      )
    );
  });
}

const TIP = "Pinned at 14:00 — the scheduler won't move it";

describe("pinned mark", () => {
  it.each([
    ["row desk", { layout: "row" }],
    ["row touch", { layout: "row", density: "touch" }],
    ["row agenda", { layout: "row", density: "agenda" }],
    ["row mini", { layout: "row", density: "mini" }],
    ["card", { layout: "card" }],
    ["block short", { layout: "block", box: { h: 20 } }],
    ["block tall", { layout: "block", box: { h: 80 } }],
  ])("%s shows the pin with its tooltip", (_name, props) => {
    mount(task, props);
    const pin = host.querySelector("[data-task-pin]") as HTMLElement;
    expect(pin).not.toBeNull();
    expect(pin.getAttribute("title")).toBe(TIP);
    expect(pin.getAttribute("aria-label")).toBe(TIP);
  });

  it("draws nothing for an unpinned task", () => {
    mount({ ...task, isFixed: false, auto: true }, { layout: "row" });
    expect(host.querySelector("[data-task-pin]")).toBeNull();
  });
});

const RISK = "Can't fit before the due date";

describe("at-risk mark", () => {
  const risky = { ...task, isFixed: false, auto: true, atRisk: true } as V3Task;

  it.each([
    ["row desk", { layout: "row" }],
    ["row touch", { layout: "row", density: "touch" }],
    ["card", { layout: "card" }],
    ["block short", { layout: "block", box: { h: 20 } }],
    ["block tall", { layout: "block", box: { h: 80 } }],
  ])("%s shows the mark with its tooltip", (_name, props) => {
    mount(risky, props);
    const mark = host.querySelector("[data-task-at-risk]") as HTMLElement;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute("title")).toBe(RISK);
    expect(host.querySelector("[data-task-pin]")).toBeNull();
  });

  it("draws nothing for a task that fits", () => {
    mount({ ...risky, atRisk: false } as V3Task, { layout: "row" });
    expect(host.querySelector("[data-task-at-risk]")).toBeNull();
  });
});
