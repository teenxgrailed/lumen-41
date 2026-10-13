/**
 * @jest-environment jsdom
 *
 * A project's flow on both faces, mounted through `WorkScreen` like the swap
 * test: a task is the closing step of its own chain (its first step, then its
 * subtasks in order, then the task), a task that waits on an open one comes
 * after it and says so, the last step ticked closes the task in one go, and
 * the "Add a task" line behaves (Enter adds, Esc clears, an IME candidate does
 * not add, the hint is always there so the line never reflows).
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { newDate } from "@/lib/date-utils";
import { browserTimeZone } from "@/lib/needt3/hooks/core";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { qk } from "@/lib/needt3/query-keys";

import { V3PortalScope } from "../../ctx/PortalScope";
import { dayIn } from "../../phone/overlays/today";
import { PhoneUiProvider } from "../../root/phone-ui-context";
import { WorkScreen } from "../WorkScreen";

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
}));
jest.mock("../../dialogs/TaskDialog", () => ({
  TaskDialogHost: () => null,
}));
const push = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/projects/p-ops",
  useSearchParams: () => new URLSearchParams(),
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

const task = (id: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    notes: null,
    done: false,
    status: "todo",
    projectId: "p-ops",
    dueDate: TODAY,
    estimatedMinutes: 30,
    scheduledStart: null,
    scheduledEnd: null,
    isFixed: false,
    auto: false,
    noSlot: false,
    entry: null,
    blockedBy: null,
    trashedAt: null,
    updatedAt: "2026-09-01T08:00:00.000Z",
    parts: [],
    waits: [],
    ...over,
  }) as V3Task;

const OPS: V3Project = {
  id: "p-ops",
  name: "Operations",
  color: null,
  icon: null,
  ground: null,
  position: 0,
  archived: false,
};

// "after" is listed first on purpose: it waits on "brief", so the page must
// put "brief" (and its steps) ahead of it.
const TASKS = [
  task("after", { title: "Send it out", blockedBy: "brief" }),
  task("brief", {
    title: "Ship the launch brief",
    entry: "Open last month's numbers",
    parts: [
      { id: "s1", title: "Pull the numbers", done: true },
      { id: "s2", title: "Draft the page", done: false },
      { id: "s3", title: "Review with Anna", done: false },
    ],
  }),
  task("last", {
    title: "Book the venue",
    parts: [
      { id: "l1", title: "Call two venues", done: true },
      { id: "l2", title: "Pay the deposit", done: false },
    ],
  }),
];

let host: HTMLDivElement;
let root: Root;
let sent: { method: string; url: string; body: Record<string, unknown> }[];

beforeEach(() => {
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
  jest.spyOn(performance, "now").mockReturnValue(100);
  push.mockClear();
  sent = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET")
        return { ok: true, status: 200, text: async () => "[]" };
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      sent.push({ method, url, body });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: url.split("/").pop(),
            title: "x",
            status: "todo",
            done: false,
            ...body,
          }),
      };
    }
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

function render(ui: PhoneUi) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(qk.tasks({}), TASKS);
  client.setQueryData(qk.projects(), [OPS]);
  act(() =>
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(
          PhoneUiProvider,
          { value: ui },
          h(
            V3PortalScope,
            null,
            h(WorkScreen, { mode: "projects", projectId: "p-ops" })
          )
        )
      )
    )
  );
}

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const settle = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const flow = (id: string) => q<HTMLElement>(`[data-wk-flow="${id}"]`);
const stepTexts = (id: string) =>
  [...flow(id).querySelectorAll(".wk-step-text")].map((n) => n.textContent);
const checkOf = (id: string, title: string) =>
  [...flow(id).querySelectorAll<HTMLElement>(".wk-step")]
    .find((li) => li.textContent?.includes(title))!
    .querySelector<HTMLButtonElement>("button")!;

describe.each([["desktop" as const], ["phone" as const]])(
  "A project's flow · %s face",
  (face) => {
    it("draws the first step, then the subtasks in order, then the task last", () => {
      render(face);
      expect(stepTexts("brief")).toEqual([
        "Open last month's numbers",
        "Pull the numbers",
        "Draft the page",
        "Review with Anna",
      ]);
      const kids = [...flow("brief").children];
      expect(kids[0].classList.contains("wk-steps")).toBe(true);
      expect(kids[kids.length - 1].classList.contains("wk-close")).toBe(true);
      expect(kids[kids.length - 1].textContent).toBe("Last step · 1 of 3 done");
      // the task's own row sits between them, not above the steps
      const middle = kids.slice(1, -1).map((k) => k.textContent);
      expect(middle.join(" ")).toContain("Ship the launch brief");
      expect(flow("brief").classList.contains("is-touch")).toBe(
        face === "phone"
      );
      // the first step is drawn once: in the flow, not under the row as well
      expect(host.textContent?.split("Open last month's numbers").length).toBe(
        2
      );
    });

    it("puts a blocker before the task it blocks, and says what it waits on", () => {
      render(face);
      const order = [...host.querySelectorAll("[data-wk-flow]")].map((n) =>
        n.getAttribute("data-wk-flow")
      );
      expect(order.indexOf("brief")).toBeLessThan(order.indexOf("after"));
      expect(flow("after").classList.contains("is-blocked")).toBe(true);
      expect(q("[data-wk-flow=after] [data-wk-wait]").textContent).toBe(
        "Waits on “Ship the launch brief”"
      );
      // a task that waits on nothing and has no steps is just its row
      expect(flow("brief").querySelector("[data-wk-wait]")).toBeNull();
    });

    it("ticking a step writes the step and leaves the task open", async () => {
      render(face);
      act(() => checkOf("brief", "Draft the page").click());
      await settle();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        method: "PATCH",
        url: "/api/tasks/brief/parts/s2",
        body: { done: true },
      });
    });

    it("ticking the last open step closes the task with it", async () => {
      render(face);
      act(() => checkOf("last", "Pay the deposit").click());
      await settle();
      expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
        "PATCH /api/tasks/last/parts/l2",
        "PUT /api/tasks/last",
      ]);
      expect(sent[1].body).toMatchObject({ status: "completed" });
    });

    it("unticking a step never closes or reopens the task", async () => {
      render(face);
      act(() => checkOf("last", "Call two venues").click());
      await settle();
      expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
        "PATCH /api/tasks/last/parts/l1",
      ]);
      expect(sent[0].body).toMatchObject({ done: false });
    });
  }
);

describe("The Add a task line · desktop", () => {
  const input = () => q<HTMLInputElement>(".wk-padd-input");
  const type = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input(), value);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true, ...init })
      );
    });

  it("always carries its hint, so typing never reflows the line", () => {
    render("desktop");
    const hint = q(".wk-padd-hint");
    expect(hint.textContent).toBe("Enter to add");
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    expect(q(".wk-padd").hasAttribute("data-filled")).toBe(false);
    type("Write the brief");
    expect(q(".wk-padd").hasAttribute("data-filled")).toBe(true);
    expect(q(".wk-padd-hint")).toBe(hint);
    type("   ");
    expect(q(".wk-padd").hasAttribute("data-filled")).toBe(false);
  });

  it("Enter adds the task to this project and clears the line", async () => {
    render("desktop");
    type("  Write the brief ");
    key("Enter");
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: "POST",
      url: "/api/tasks",
      body: { title: "Write the brief", projectId: "p-ops" },
    });
    expect(input().value).toBe("");
  });

  it("Enter on an empty line adds nothing", async () => {
    render("desktop");
    key("Enter");
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("Enter that picks an IME candidate does not add", async () => {
    render("desktop");
    type("かいぎ");
    key("Enter", { isComposing: true });
    await settle();
    expect(sent).toHaveLength(0);
    expect(input().value).toBe("かいぎ");
  });

  it("Esc clears the line and leaves it", () => {
    render("desktop");
    input().focus();
    type("Write the brief");
    expect(document.activeElement).toBe(input());
    key("Escape");
    expect(input().value).toBe("");
    expect(document.activeElement).not.toBe(input());
    expect(sent).toHaveLength(0);
  });
});
