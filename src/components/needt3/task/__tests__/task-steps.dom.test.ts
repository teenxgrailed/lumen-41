/**
 * @jest-environment jsdom
 *
 * Steps inside a task row: the next undone step under the title, numbered by
 * position (the entry is Step 1), a tap on the count unfolds all of them, each
 * step has its own tick (the subtask write), done steps are struck, the fold
 * is remembered per task, and the task view's `subtasks` option decides what
 * shows: next step + expand, all steps open, or the count only.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { resetStepsOpen } from "@/lib/needt3/hooks/steps-open";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { stepList } from "@/lib/needt3/step-list";

import { Task } from "../Task";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));

const task = (over: Partial<V3Task> = {}) =>
  ({
    id: "a",
    title: "Ship the brief",
    done: false,
    status: "todo",
    projectId: null,
    dueDate: null,
    estimatedMinutes: 45,
    scheduledStart: null,
    scheduledEnd: null,
    priority: "medium",
    entry: "Open last month's numbers",
    parts: [
      { id: "s1", title: "Pull the numbers", done: true },
      { id: "s2", title: "Draft the page", done: false },
      { id: "s3", title: "Review with Anna", done: false },
    ],
    waits: [],
    ...over,
  }) as unknown as V3Task;

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let sent: { method: string; url: string; body: unknown }[];

const view = (taskView: Record<string, unknown>) =>
  client.setQueryData(qk.settings(), {
    theme: "light",
    defaultView: "week",
    timeZone: "UTC",
    weekStartDay: "monday",
    timeFormat: "24h",
    prefs: { taskView },
  });

function mount(
  t: V3Task,
  density: "desk" | "touch" = "desk",
  extra: Record<string, unknown> = {}
) {
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(Task, {
          task: t,
          layout: "row",
          density,
          today: "2026-10-16",
          ...extra,
        })
      )
    );
  });
}

const next = () => host.querySelector("[data-step-next]")?.textContent ?? null;
const toggle = () =>
  host.querySelector<HTMLButtonElement>("[data-steps-toggle]");
const rows = () => [
  ...host.querySelectorAll<HTMLElement>("[data-steps-list] .tk-step"),
];
const fold = () => host.querySelector(".tk-steps-fold") as HTMLElement | null;
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

beforeEach(() => {
  window.localStorage.clear();
  resetStepsOpen();
  sent = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET")
        sent.push({
          method,
          url,
          body: JSON.parse(String(init?.body ?? "{}")),
        });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "s2", title: "x", done: true }),
      };
    }
  );
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(qk.projects(), []);
  view({});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("the step list", () => {
  it("numbers the entry as Step 1 and the subtasks after it", () => {
    expect(stepList(task()).map((s) => [s.n, s.title])).toEqual([
      [1, "Open last month's numbers"],
      [2, "Pull the numbers"],
      [3, "Draft the page"],
      [4, "Review with Anna"],
    ]);
  });

  it("starts at the first subtask when there is no entry", () => {
    expect(stepList(task({ entry: null })).map((s) => s.n)).toEqual([1, 2, 3]);
  });

  it("is empty for a task with no subtasks", () => {
    expect(stepList(task({ parts: [] }))).toEqual([]);
  });
});

describe("next step", () => {
  it("shows the next undone step under the title, numbered by position", () => {
    mount(task());
    expect(next()).toBe("Step 3: Draft the page");
  });

  it("counts the entry as Step 1 and as the next step before anything is ticked", () => {
    mount(
      task({
        parts: [
          { id: "s1", title: "Pull the numbers", done: false },
          { id: "s2", title: "Draft the page", done: false },
        ],
      })
    );
    expect(next()).toBe("Step 1: Open last month's numbers");
  });

  it("is on the phone row too", () => {
    mount(task(), "touch");
    expect(next()).toBe("Step 3: Draft the page");
  });

  it("is not shown for a closed task", () => {
    mount(task({ done: true }));
    expect(next()).toBeNull();
  });

  it("is not drawn for a task with no subtasks", () => {
    mount(task({ parts: [] }));
    expect(host.querySelector("[data-steps]")).toBeNull();
    expect(toggle()).toBeNull();
  });
});

describe("expand", () => {
  it("a tap on the count unfolds every step as a numbered list", () => {
    mount(task());
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(fold()?.classList.contains("is-open")).toBe(false);
    act(() => toggle()!.click());
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(fold()?.classList.contains("is-open")).toBe(true);
    expect(rows().map((r) => r.textContent)).toEqual([
      "Step 1: Open last month's numbers",
      "Step 2: Pull the numbers",
      "Step 3: Draft the page",
      "Step 4: Review with Anna",
    ]);
    // the list replaces the next-step line
    expect(next()).toBeNull();
    act(() => toggle()!.click());
    expect(fold()?.classList.contains("is-open")).toBe(false);
    expect(next()).toBe("Step 3: Draft the page");
  });

  it("strikes done steps and shows the count", () => {
    mount(task());
    expect(host.querySelector(".tk-count")?.textContent).toBe("1/3");
    act(() => toggle()!.click());
    const done = rows().filter((r) => r.classList.contains("is-done"));
    expect(done.map((r) => r.textContent)).toEqual([
      "Step 1: Open last month's numbers",
      "Step 2: Pull the numbers",
    ]);
  });

  it("is remembered per task, per person, in this browser", () => {
    mount(task());
    act(() => toggle()!.click());
    expect(window.localStorage.getItem("needt.stepsOpen.anon")).toContain(
      '"a"'
    );
    // a fresh mount (a reload) reads it back
    act(() => root.unmount());
    resetStepsOpen();
    root = createRoot(host);
    mount(task());
    expect(fold()?.classList.contains("is-open")).toBe(true);
    // another task stays folded
    mount(task({ id: "b" }));
    expect(fold()?.classList.contains("is-open")).toBe(false);
  });

  it("works on the phone row", () => {
    mount(task(), "touch");
    act(() => toggle()!.click());
    expect(rows()).toHaveLength(4);
  });
});

describe("tick a step", () => {
  it("writes the subtask and updates the list and the count", async () => {
    mount(task());
    act(() => toggle()!.click());
    const second = rows()[2].querySelector("button") as HTMLButtonElement;
    act(() => second.click());
    await settle();
    expect(sent[0]).toMatchObject({
      method: "PATCH",
      url: "/api/tasks/a/parts/s2",
      body: { done: true },
    });
  });

  it("the entry has no tick of its own", () => {
    mount(task());
    act(() => toggle()!.click());
    expect(rows()[0].querySelector("button")).toBeNull();
  });
});

describe("the task view's subtasks option", () => {
  it("all steps open: the list is open with no fold control", () => {
    view({ subtasks: "all" });
    mount(task());
    expect(fold()?.classList.contains("is-open")).toBe(true);
    expect(rows()).toHaveLength(4);
    expect(toggle()).toBeNull();
    expect(host.querySelector(".tk-count")?.textContent).toBe("1/3");
  });

  it("count only: just 0/3, no line, no list, no fold control", () => {
    view({ subtasks: "count" });
    mount(task());
    expect(host.querySelector(".tk-count")?.textContent).toBe("1/3");
    expect(next()).toBeNull();
    expect(host.querySelector("[data-steps-list]")).toBeNull();
    expect(toggle()).toBeNull();
  });

  it("the old off switch reads as count only", () => {
    view({ subtasks: false });
    mount(task());
    expect(host.querySelector(".tk-count")).not.toBeNull();
    expect(next()).toBeNull();
    expect(toggle()).toBeNull();
  });

  it("a project page that draws the steps itself keeps only the count", () => {
    mount(task(), "desk", { hideSteps: true });
    expect(host.querySelector(".tk-count")?.textContent).toBe("1/3");
    expect(next()).toBeNull();
    expect(toggle()).toBeNull();
  });
});
