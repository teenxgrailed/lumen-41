/**
 * @jest-environment jsdom
 *
 * A `<Task>` under a screen's CompletionScope takes its exit and its check
 * from it: no row is wired by hand, and every layout carries `data-complete`.
 * Row details (the task view) hide the duration, the project and the parts.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { Task } from "../Task";
import { type Completion, CompletionScope } from "../useCompletion";

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
  projectId: "p",
  dueDate: null,
  estimatedMinutes: 45,
  scheduledStart: "2026-10-16T10:00",
  scheduledEnd: "2026-10-16T10:45",
  priority: "medium",
  entry: null,
  parts: [{ id: "x", title: "x", done: true, position: 0 }],
  waits: [],
} as unknown as V3Task;

beforeEach(() => {
  (globalThis as { fetch?: unknown }).fetch = () => new Promise(() => {});
  client = new QueryClient();
  client.setQueryData(qk.projects(), [
    { id: "p", name: "Launch", color: "#476F55" },
  ]);
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

const scope = (phase: Completion["phase"], check = jest.fn()) =>
  ({
    phase,
    check,
    hold: (l: unknown) => l,
    drop: jest.fn(),
  }) as unknown as Completion;

function mount(
  layout: "row" | "block",
  value: Completion,
  extra: Record<string, unknown> = {}
) {
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(CompletionScope, {
          value,
          children: h(Task, { task, layout, today: "2026-10-16", ...extra }),
        })
      )
    );
  });
}

describe("Task under a CompletionScope", () => {
  it("a desk row takes its phase: struck, then collapsing", () => {
    mount("row", scope({ a: "strike" }));
    const row = host.querySelector(".hd-row") as HTMLElement;
    expect(row.dataset.complete).toBe("strike");
    expect(row.classList.contains("is-striking")).toBe(true);
    expect(row.classList.contains("is-collapsing")).toBe(false);
    mount("row", scope({ a: "collapse" }));
    expect(
      (host.querySelector(".hd-row") as HTMLElement).classList.contains(
        "is-collapsing"
      )
    ).toBe(true);
  });

  it("a row not in the phase map carries nothing", () => {
    mount("row", scope({ other: "strike" }));
    expect(
      (host.querySelector(".hd-row") as HTMLElement).dataset.complete
    ).toBe(undefined);
  });

  it("a calendar block takes it too: dimmed while struck, gone on collapse", () => {
    mount("block", scope({ a: "strike" }));
    const block = host.querySelector(".tk-block") as HTMLElement;
    expect(block.dataset.complete).toBe("strike");
    expect(block.style.opacity).toBe("0.5");
    mount("block", scope({ a: "collapse" }));
    const gone = host.querySelector(".tk-block") as HTMLElement;
    expect(gone.style.opacity).toBe("0");
  });

  it("the check goes to the screen's completion, not to its own toggle", () => {
    const check = jest.fn();
    mount("row", scope({}, check));
    act(() =>
      (host.querySelector("button.tk-check") as HTMLButtonElement).click()
    );
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0].id).toBe("a");
  });

  it("an explicit phase from the screen wins", () => {
    mount("row", scope({ a: "collapse" }), { phase: "strike" });
    expect(
      (host.querySelector(".hd-row") as HTMLElement).dataset.complete
    ).toBe("strike");
  });
});

describe("row details", () => {
  const set = (taskView: Record<string, unknown>) =>
    client.setQueryData(qk.settings(), {
      theme: "light",
      defaultView: "week",
      timeZone: "UTC",
      weekStartDay: "monday",
      timeFormat: "24h",
      prefs: { taskView },
    });

  it("shows duration, project and parts by default", () => {
    mount("row", scope({}));
    expect(host.textContent).toContain("45");
    expect(host.textContent).toContain("Launch");
    expect(host.querySelector(".tk-count")).not.toBeNull();
  });

  it("each switch removes its own detail and no other", () => {
    set({ duration: false });
    mount("row", scope({}));
    expect(host.querySelector(".tk-cell-dur")?.textContent).toBe("");
    expect(host.textContent).toContain("Launch");
    expect(host.querySelector(".tk-count")).not.toBeNull();

    set({ project: false });
    mount("row", scope({}));
    expect(host.textContent).not.toContain("Launch");

    set({ subtasks: false });
    mount("row", scope({}));
    expect(host.querySelector(".tk-count")).toBeNull();
  });
});
