/**
 * @jest-environment jsdom
 *
 * Phone Projects, mounted for real over a seeded query cache and a fake
 * `fetch`: the list rows and where they lead, a project's page (its groups,
 * the add field, the options sheet), and the writes: Add creates an undated
 * task of the project, Delete archives it and goes back, Edit refuses a name
 * another project has.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { newDate } from "@/lib/date-utils";
import { browserTimeZone } from "@/lib/needt3/hooks/core";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";

import { useWorkState } from "../../../work/useWorkState";
import { dayIn } from "../../overlays/today";
import { PhoneProjects } from "../ProjectsPhone";

// StScreen reaches V3Root (the whole shell and every stylesheet); with the
// design flag off it renders its children, which is all this test needs.
jest.mock("../../../states/StScreen", () => ({
  StScreen: ({ children }: { children: unknown }) => children,
}));
const push = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/projects",
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
  task("b", { projectId: OPS.id, dueDate: null }),
  task("c", { projectId: OPS.id, done: true, status: "completed" }),
  task("d", { projectId: LAB.id }),
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
  // CI starts this file within 300 ms of its window opening: every tap guard
  // (PullDown, Row) must let a tap through then. Pinning the clock there makes
  // the test see that case on every machine.
  jest.spyOn(performance, "now").mockReturnValue(100);
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
            id: url.split("/").pop() === "tasks" ? "new" : url.split("/").pop(),
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

// the screen takes the controller from above, as WorkScreen gives it
function Harness({ projectId }: { projectId: string | null }) {
  return h(PhoneProjects, { projectId, state: useWorkState("all") });
}

function mount(projectId: string | null = null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  qc.setQueryData(qk.tasks({}), TASKS);
  qc.setQueryData(qk.projects(), [OPS, LAB]);
  act(() =>
    root.render(
      h(QueryClientProvider, { client: qc }, h(Harness, { projectId }))
    )
  );
}

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
// the write is a few promise hops and a query cancel: let them all run
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

describe("PhoneProjects: the list", () => {
  it("a row names the open count and the next task; a tap opens the page", () => {
    mount();
    expect(q(`[data-ptk-project="p-ops"] .ptk-prow-meta`).textContent).toBe(
      "2 open · next: Task a"
    );
    expect(q(`[data-ptk-project="p-lab"] .ptk-prow-meta`).textContent).toBe(
      "1 open · next: Task d"
    );
    act(() => q<HTMLElement>(`[data-ptk-project="p-ops"]`).click());
    expect(push).toHaveBeenCalledWith("/projects/p-ops");
  });
});

describe("PhoneProjects: a project's page", () => {
  it("groups the open tasks by when and folds Done shut", () => {
    mount("p-ops");
    expect(q("h1").textContent).toBe("Operations");
    const titles = [...host.querySelectorAll(".pk-sec .pk-label")].map(
      (n) => n.textContent
    );
    expect(titles).toEqual(["Today", "No date", "Done"]);
    // inside the page the project is not repeated on the rows
    expect(host.querySelector(".pk-row-proj")).toBeNull();
    expect(host.querySelector(`[data-pk-row="c"]`)).toBeNull();
    act(() => q<HTMLElement>("[data-ptk-back]").click());
    expect(push).toHaveBeenCalledWith("/projects");
  });

  it("Add creates an undated task of this project", async () => {
    mount("p-ops");
    const input = q<HTMLInputElement>("[data-ptk-add]");
    type(input, "  Write the brief ");
    act(() => q<HTMLElement>("[data-ptk-add-go]").click());
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ method: "POST", url: "/api/tasks" });
    expect(sent[0].body).toMatchObject({
      title: "Write the brief",
      projectId: "p-ops",
      dueDate: null,
    });
    expect(input.value).toBe("");
  });

  it("an empty line adds nothing", async () => {
    mount("p-ops");
    type(q<HTMLInputElement>("[data-ptk-add]"), "   ");
    act(() => {
      q<HTMLElement>("[data-ptk-add]").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("Delete archives the project and goes back to the list", async () => {
    mount("p-ops");
    act(() => q<HTMLElement>("[data-ptk-menu]").click());
    expect(q(`[data-ptk-act="delete"] .ptk-act-line`).textContent).toBe(
      "2 open tasks move to No project"
    );
    act(() => q<HTMLElement>(`[data-ptk-act="delete"]`).click());
    await settle();
    expect(push).toHaveBeenCalledWith("/projects");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: "PUT",
      url: "/api/projects/p-ops",
    });
    expect(sent[0].body).toEqual({ status: "archived" });
  });

  it("Edit refuses a name another project has, and saves a new one", async () => {
    mount("p-ops");
    act(() => q<HTMLElement>("[data-ptk-menu]").click());
    act(() => q<HTMLElement>(`[data-ptk-act="edit"]`).click());
    const name = q<HTMLInputElement>("[data-ptk-edit-name]");
    const save = q<HTMLButtonElement>("[data-ptk-save]");
    type(name, "lab");
    expect(q(".ptk-edit-err").textContent).toBe(
      "A project with this name exists."
    );
    expect(save.disabled).toBe(true);
    act(() => save.click());
    await settle();
    expect(sent).toHaveLength(0);

    type(name, "Operations 2");
    expect(host.querySelector(".ptk-edit-err")).toBeNull();
    act(() => q<HTMLButtonElement>("[data-ptk-save]").click());
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: "PUT",
      url: "/api/projects/p-ops",
    });
    expect(sent[0].body).toMatchObject({ name: "Operations 2" });
  });
});
