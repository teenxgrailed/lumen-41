/**
 * @jest-environment jsdom
 *
 * Phone Tasks, mounted for real over a seeded query cache and a fake `fetch`:
 * the sections, the tab counts, and the swipe that writes. A swipe right
 * writes `done`, a swipe left writes tomorrow (and is not offered on a task
 * that is already after today); a cancelled or abandoned swipe writes
 * nothing; the check on a done row reopens it.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { newDate } from "@/lib/date-utils";
import { addDays } from "@/lib/needt3/derive";
import { browserTimeZone } from "@/lib/needt3/hooks/core";
import type { V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { usePhoneOverlays } from "../../overlays/store";
import { dayIn } from "../../overlays/today";
import { PhoneTasks } from "../TasksPhone";

// StScreen reaches V3Root (the whole shell and every stylesheet); with the
// design flag off it renders its children, which is all this test needs.
jest.mock("../../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
}));

const mockReplace = jest.fn();
let mockParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => "/tasks",
  useSearchParams: () => mockParams,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const TODAY = dayIn(newDate(), browserTimeZone());
const TOMORROW = addDays(TODAY, 1);
const LATER = addDays(TODAY, 3);

const task = (id: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: null,
    dueDate: TODAY,
    estimatedMinutes: 30,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    auto: false,
    noSlot: false,
    trashedAt: null,
    updatedAt: "2026-09-01T08:00:00.000Z",
    parts: [],
    waits: [],
    ...over,
  }) as V3Task;

const TASKS = [
  task("open"),
  task("late", { dueDate: addDays(TODAY, -2) }),
  task("done", { done: true, status: "completed" }),
  task("soon", { dueDate: LATER }),
];

let host: HTMLDivElement;
let root: Root;
let puts: { url: string; body: Record<string, unknown> }[];

function pointer(
  type: string,
  props: { x?: number; y?: number; id?: number } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: props.x ?? 0,
    clientY: props.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: props.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });

// the write is a few promise hops and a query cancel: let them all run
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

beforeEach(() => {
  // reduced motion: an exit commits at once, no timers to wait for
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  puts = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        puts.push({ url, body });
        const id = url.split("/").pop();
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id,
              title: `Task ${id}`,
              status: "todo",
              ...body,
            }),
        };
      }
      return { ok: true, status: 200, text: async () => "[]" };
    }
  );
  usePhoneOverlays.setState({ taskId: null, taskSeed: null });
  mockParams = new URLSearchParams();
  mockReplace.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  qc.setQueryData(qk.tasks({}), TASKS);
  qc.setQueryData(qk.projects(), []);
  act(() => root.render(h(QueryClientProvider, { client: qc }, h(PhoneTasks))));
  // the tab the person left last is remembered; every test starts on Today
  act(() => host.querySelector<HTMLElement>("[data-ptk-tab=today]")!.click());
}

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const rowOpen = (id: string) =>
  q<HTMLElement>(`[data-pk-row="${id}"] .pk-row-open`);

function swipe(id: string, dx: number) {
  fire(rowOpen(id), "pointerdown", { x: 100, y: 10 });
  fire(window, "pointermove", { x: 100 + dx, y: 12 });
}

describe("PhoneTasks", () => {
  it("draws the Today tab: Overdue, Today, a shut Done fold, counts on the tabs", () => {
    mount();
    const titles = [...host.querySelectorAll(".pk-sec .pk-label")].map(
      (n) => n.textContent
    );
    expect(titles).toEqual(["Overdue", "Today", "Done"]);
    expect(q(`[data-pk-row="late"]`)).toBeTruthy();
    expect(q(`[data-pk-row="open"]`)).toBeTruthy();
    // Done is shut
    expect(host.querySelector(`[data-pk-row="done"]`)).toBeNull();
    expect(q("[data-ptk-tab=today] .ptk-seg-n").textContent).toBe("2");
    expect(q("[data-ptk-tab=upcoming] .ptk-seg-n").textContent).toBe("1");
    // every section is a drop zone the drag layer reads
    expect(
      [...host.querySelectorAll("[data-pd-zone]")].map((n) => [
        n.getAttribute("data-pd-zone"),
        n.getAttribute("data-pd-mode"),
      ])
    ).toEqual([
      ["overdue", "none"],
      ["today", "move"],
      ["Done", "none"],
    ]);
  });

  it("a tap opens the task sheet", () => {
    mount();
    act(() => rowOpen("open").click());
    expect(usePhoneOverlays.getState().taskId).toBe("open");
  });

  it("?task=<id> opens that task's sheet once and leaves the URL clean", () => {
    mockParams = new URLSearchParams("task=late&x=1");
    mount();
    expect(usePhoneOverlays.getState().taskId).toBe("late");
    expect(mockReplace).toHaveBeenCalledWith("/tasks?x=1", { scroll: false });
  });

  it("a swipe right writes done", async () => {
    mount();
    swipe("open", 140);
    fire(window, "pointerup", { x: 240, y: 12 });
    await settle();
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe("/api/tasks/open");
    expect(puts[0].body).toMatchObject({ status: "completed" });
  });

  it("a swipe left writes tomorrow, keeping nothing else", async () => {
    mount();
    swipe("open", -140);
    fire(window, "pointerup", { x: -40, y: 12 });
    await settle();
    expect(puts).toHaveLength(1);
    expect(String(puts[0].body.dueDate)).toContain(TOMORROW);
    expect(puts[0].body).not.toHaveProperty("status");
  });

  it("a cancelled swipe writes nothing and the row goes home", async () => {
    mount();
    swipe("open", 140);
    fire(window, "pointercancel", { x: 0, y: 0 });
    await settle();
    expect(puts).toHaveLength(0);
    expect(q<HTMLElement>(`[data-pk-row="open"] .pk-row`).style.transform).toBe(
      ""
    );
  });

  it("unmounting in the middle of a swipe writes nothing", async () => {
    mount();
    swipe("open", 140);
    act(() => root.unmount());
    fire(window, "pointerup", { x: 240, y: 12 });
    await settle();
    expect(puts).toHaveLength(0);
    // the afterEach unmount is then a no-op on a fresh root
    root = createRoot(host);
  });

  it("a short drag is not a swipe", async () => {
    mount();
    swipe("open", 20);
    fire(window, "pointerup", { x: 120, y: 12 });
    await settle();
    expect(puts).toHaveLength(0);
  });

  it("Upcoming: a task already after today cannot be sent to tomorrow, but can be done", async () => {
    mount();
    act(() => q<HTMLElement>("[data-ptk-tab=upcoming]").click());
    swipe("soon", -140);
    fire(window, "pointerup", { x: -40, y: 12 });
    await settle();
    expect(puts).toHaveLength(0);
    swipe("soon", 140);
    fire(window, "pointerup", { x: 240, y: 12 });
    await settle();
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ status: "completed" });
  });

  it("the check on a done row reopens it", async () => {
    mount();
    act(() => q<HTMLElement>(".pk-sec-fold[aria-expanded=false]").click());
    const check = q<HTMLElement>(`[data-pk-row="done"] .pk-check`);
    act(() => check.click());
    await settle();
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ status: "todo" });
  });
});
