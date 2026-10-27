/**
 * @jest-environment jsdom
 *
 * Two faces, one state. `WorkScreen` draws the phone face or the desktop face
 * from `usePhoneUi()`; crossing 700 px swaps them without remounting the route.
 * What a person has set on one face must still be there on the other: the
 * selected tab, a project page's typed "Add a task" line and its folds, and
 * the project edit sheet with what was typed in it. A write that was already
 * on its way must not be lost either.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { newDate } from "@/lib/date-utils";
import { addDays } from "@/lib/needt3/derive";
import { browserTimeZone } from "@/lib/needt3/hooks/core";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import type { PhoneUi } from "@/lib/needt3/phone-ui";
import { qk } from "@/lib/needt3/query-keys";

import { V3PortalScope } from "../../../ctx/PortalScope";
import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { WorkScreen } from "../../../work/WorkScreen";
import { dayIn } from "../../overlays/today";

// The design flag and the shell behind it: not what is under test.
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
}));
jest.mock("../../../dialogs/TaskDialog", () => ({
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

const project = (id: string, name: string): V3Project => ({
  id,
  name,
  color: null,
  icon: null,
  ground: null,
  position: 0,
  archived: false,
});

const OPS = project("p-ops", "Operations");
const LAB = project("p-lab", "Lab");
const TASKS = [
  task("a", { projectId: OPS.id }),
  task("b", { projectId: OPS.id, done: true, status: "completed" }),
  task("soon", { dueDate: addDays(TODAY, 2) }),
  task("l1", { projectId: LAB.id }),
  task("l2", { projectId: LAB.id, done: true, status: "completed" }),
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
  push.mockClear();
  replace.mockClear();
  sent = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET")
        return { ok: true, status: 200, text: async () => "[]" };
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push({ method, url, body });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: url.split("/").pop(),
            title: "x",
            name: "x",
            status: "todo",
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

const qc = () => {
  const c = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  c.setQueryData(qk.tasks({}), TASKS);
  c.setQueryData(qk.projects(), [OPS, LAB]);
  return c;
};

/** The same element tree at every call: only the `ui` value changes. */
function render(client: QueryClient, ui: PhoneUi, projectId: string | null) {
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
            h(WorkScreen, {
              mode: projectId ? "projects" : "tasks",
              projectId,
            })
          )
        )
      )
    )
  );
}

// The phone remembers the last tab across visits (a module value that seeds
// the shared state); each test starts from Today so none depends on another.
const startOnToday = () =>
  act(() => host.querySelector<HTMLElement>("[data-ptk-tab=today]")!.click());

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const settle = async () => {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("Tasks across the 700 px swap", () => {
  it("keeps the selected tab both ways", () => {
    const client = qc();
    render(client, "phone", null);
    startOnToday();
    expect(host.querySelector(".ptk-seg")).toBeTruthy();
    act(() => q<HTMLElement>("[data-ptk-tab=upcoming]").click());
    expect(q("[data-ptk-tab=upcoming]").getAttribute("aria-selected")).toBe(
      "true"
    );

    render(client, "desktop", null);
    expect(host.querySelector(".ptk-seg")).toBeNull();
    expect(q("[role=tab][aria-selected=true]").textContent).toContain("Upcoming");

    // changed on the desktop face ...
    act(() => {
      [...host.querySelectorAll<HTMLElement>(".wk-tabs [role=tab]")]
        .find((b) => b.textContent?.startsWith("Inbox"))!
        .click();
    });
    // ... and still there on the phone face
    render(client, "phone", null);
    expect(q("[data-ptk-tab=inbox]").getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("a fold opened on one face is open on the other", () => {
    const client = qc();
    render(client, "phone", null);
    startOnToday();
    // Done is shut by default
    expect(host.querySelector(`[data-pk-row="b"]`)).toBeNull();
    act(() => q<HTMLElement>(".pk-sec-fold[aria-expanded=false]").click());
    expect(q(`[data-pk-row="b"]`)).toBeTruthy();

    render(client, "desktop", null);
    expect(host.textContent).toContain("Task b");
    render(client, "phone", null);
    expect(q(`[data-pk-row="b"]`)).toBeTruthy();
  });
});

describe("A project's page across the swap", () => {
  it("keeps the typed line, the folds and the open edit sheet", () => {
    const client = qc();
    render(client, "phone", "p-ops");
    type(q<HTMLInputElement>("[data-ptk-add]"), "Write the brief");
    // Done is shut by default: open it on the phone
    act(() => q<HTMLElement>(".pk-sec-fold[aria-expanded=false]").click());
    expect(q(`[data-pk-row="b"]`)).toBeTruthy();

    render(client, "desktop", "p-ops");
    expect(q<HTMLInputElement>(".wk-padd-input").value).toBe("Write the brief");
    // the Done fold is open on the desktop face as well
    expect(host.textContent).toContain("Task b");

    // typed on the desktop face ...
    type(q<HTMLInputElement>(".wk-padd-input"), "Write the brief, v2");
    render(client, "phone", "p-ops");
    expect(q<HTMLInputElement>("[data-ptk-add]").value).toBe(
      "Write the brief, v2"
    );
    expect(q(`[data-pk-row="b"]`)).toBeTruthy();
  });

  it("an edit sheet that is half typed survives, with its text", () => {
    const client = qc();
    render(client, "phone", "p-ops");
    act(() => q<HTMLElement>("[data-ptk-menu]").click());
    act(() => q<HTMLElement>(`[data-ptk-act="edit"]`).click());
    type(q<HTMLInputElement>("[data-ptk-edit-name]"), "Operations 2");

    render(client, "desktop", "p-ops");
    expect(host.querySelector("[data-ptk-edit-name]")).toBeNull();
    expect(q<HTMLInputElement>(".wk-sheet-input").value).toBe("Operations 2");

    render(client, "phone", "p-ops");
    expect(q<HTMLInputElement>("[data-ptk-edit-name]").value).toBe(
      "Operations 2"
    );
  });
});

describe("Going from one project's page to another's", () => {
  it("does not carry the typed line, the folds or the edit sheet over", () => {
    const client = qc();
    render(client, "phone", "p-ops");
    type(q<HTMLInputElement>("[data-ptk-add]"), "Only for Operations");
    act(() => q<HTMLElement>(".pk-sec-fold[aria-expanded=false]").click());
    expect(q(`[data-pk-row="b"]`)).toBeTruthy();
    act(() => q<HTMLElement>("[data-ptk-menu]").click());
    act(() => q<HTMLElement>(`[data-ptk-act="edit"]`).click());
    type(q<HTMLInputElement>("[data-ptk-edit-name]"), "Renamed");

    // the same route component, a new param: nothing is remounted
    render(client, "phone", "p-lab");
    expect(q("h1").textContent).toBe("Lab");
    expect(q<HTMLInputElement>("[data-ptk-add]").value).toBe("");
    // Lab's Done fold is shut again (its done task is not drawn)
    expect(host.querySelector(`[data-pk-row="l2"]`)).toBeNull();
    // the edit sheet is shut (a shut sheet is inert) and holds nothing of A's
    expect(q("[data-ptk-edit-name]").closest("[inert]")).toBeTruthy();
    expect(q<HTMLInputElement>("[data-ptk-edit-name]").value).not.toBe(
      "Renamed"
    );

    // and the same on the desktop face
    render(client, "desktop", "p-lab");
    expect(q<HTMLInputElement>(".wk-padd-input").value).toBe("");
    expect(host.querySelector(".wk-sheet-input")).toBeNull();
  });
});

describe("A write on its way is not lost", () => {
  it("a row that was swiped away is written when the phone face goes", async () => {
    // an exit is a few timers; with motion on, unmounting would drop them
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    const client = qc();
    render(client, "phone", null);
    startOnToday();
    const open = q<HTMLElement>(`[data-pk-row="a"] .pk-row-open`);
    const fire = (el: Element | Window, type: string, x: number) =>
      act(() => {
        const e = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: 10,
        });
        Object.defineProperty(e, "pointerId", { value: 1 });
        Object.defineProperty(e, "pointerType", { value: "mouse" });
        el.dispatchEvent(e);
      });
    fire(open, "pointerdown", 100);
    fire(window, "pointermove", 240);
    fire(window, "pointerup", 240);
    // thrown off the edge, the fold-away timers are running, nothing sent yet
    expect(sent).toHaveLength(0);

    render(client, "desktop", null);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: "PUT", url: "/api/tasks/a" });
    expect(sent[0].body).toMatchObject({ status: "completed" });
  });
});
