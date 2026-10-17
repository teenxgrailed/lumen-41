/**
 * @jest-environment jsdom
 *
 * Ticking the last open step closes the task through the same shared
 * completion as ticking the task itself: the strike on the row, the "Done"
 * notice with Undo, and one Undo that reopens the task AND unticks the step.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { resetStepsOpen } from "@/lib/needt3/hooks/steps-open";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { Task } from "../Task";
import { CompletionScope, useCompletion } from "../useCompletion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => false,
}));
const success = jest.fn();
jest.mock("@/lib/notifications", () => ({
  notify: {
    success: (...a: unknown[]) => success(...a),
    error: jest.fn(),
  },
}));

const task = (parts: { id: string; title: string; done: boolean }[]) =>
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
    entry: null,
    updatedAt: "2026-10-01T08:00:00.000Z",
    parts,
    waits: [],
  }) as unknown as V3Task;

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let sent: { method: string; url: string; body: Record<string, unknown> }[];

function Screen({ t }: { t: V3Task }) {
  const completion = useCompletion();
  return h(CompletionScope, {
    value: completion,
    children: h(Task, { task: t, layout: "row", today: "2026-10-16" }),
  });
}

const mount = (t: V3Task) => {
  // the task sits in a list, as on any screen: its undo reads it from there
  client.setQueryData(qk.tasks({}), [t]);
  act(() => {
    root.render(h(QueryClientProvider, { client }, h(Screen, { t })));
  });
};
const settle = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const expand = () =>
  act(() =>
    host.querySelector<HTMLButtonElement>("[data-steps-toggle]")!.click()
  );
const tickStep = (n: number) =>
  act(() =>
    host.querySelector<HTMLElement>(`[data-step="${n}"] button`)!.click()
  );

beforeEach(() => {
  window.localStorage.clear();
  resetStepsOpen();
  success.mockClear();
  sent = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      if (method !== "GET") sent.push({ method, url, body });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: url.split("/").pop(),
            title: "x",
            status: "todo",
            updatedAt: "2026-10-01T08:00:00.000Z",
            ...body,
          }),
      };
    }
  );
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
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

describe("the last step closes the task like its own check", () => {
  const two = [
    { id: "s1", title: "Pull the numbers", done: true },
    { id: "s2", title: "Draft the page", done: false },
  ];

  it("plays the completion and shows the Done notice with Undo", async () => {
    mount(task(two));
    expand();
    tickStep(2);
    await settle();
    // the shared completion: the row is struck
    expect(
      (host.querySelector(".hd-row") as HTMLElement).dataset.complete
    ).toBe("strike");
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      "PATCH /api/tasks/a/parts/s2",
      "PUT /api/tasks/a",
    ]);
    expect(sent[1].body).toMatchObject({ status: "completed" });
    expect(success).toHaveBeenCalledWith(
      "Done · “Ship the brief”",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
  });

  it("one Undo reopens the task and unticks that last step", async () => {
    mount(task(two));
    expand();
    tickStep(2);
    await settle();
    sent.length = 0;
    const action = success.mock.calls[0][1].action as { onClick: () => void };
    await act(async () => action.onClick());
    await settle();
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      "PUT /api/tasks/a",
      "PATCH /api/tasks/a/parts/s2",
    ]);
    expect(sent[0].body).toMatchObject({ status: "todo" });
    expect(sent[1].body).toMatchObject({ done: false });
    expect(
      (host.querySelector(".hd-row") as HTMLElement).dataset.complete
    ).toBeUndefined();
  });

  it("a step that is not the last closes nothing and says nothing", async () => {
    mount(
      task([
        { id: "s1", title: "One", done: false },
        { id: "s2", title: "Two", done: false },
      ])
    );
    expand();
    tickStep(1);
    await settle();
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      "PATCH /api/tasks/a/parts/s1",
    ]);
    expect(success).not.toHaveBeenCalled();
    expect(
      (host.querySelector(".hd-row") as HTMLElement).dataset.complete
    ).toBeUndefined();
  });
});
