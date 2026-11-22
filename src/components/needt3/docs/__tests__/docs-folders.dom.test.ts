/**
 * @jest-environment jsdom
 *
 * Docs as folders, desktop and phone: pages in two or more groups open as
 * folders (project colour, count, "Updated" caption, Unsorted for the rest);
 * a click opens that group's list and Back returns; one group alone shows
 * the list straight away.
 */
import { act, createElement as h, createElement as mockH } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";

import { V3PortalScope } from "../../ctx/PortalScope";
import { DocsFace } from "../../phone/docs/Faces";
import { PhoneUiProvider } from "../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));

// Radix opens its menu on a pointer event jsdom does not send: lay the rows
// out flat so a click reaches them.
jest.mock("../../menu/RichMenu", () => ({
  RichMenu: ({
    trigger,
    items,
  }: {
    trigger: (open: boolean) => unknown;
    items: { title?: string; onClick?: () => void }[];
  }) =>
    mockH(
      "div",
      null,
      trigger(false) as never,
      ...items.map((it) =>
        mockH(
          "button",
          { key: it.title, "data-rich": it.title, onClick: it.onClick },
          it.title
        )
      )
    ),
}));

const push = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/pages",
  useSearchParams: () => new URLSearchParams(search),
}));

let data: V3Doc[] = [];
const mutateAsync = jest.fn();
let projectsState: { isPending: boolean; isError: boolean } = {
  isPending: false,
  isError: false,
};
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDocs: () => ({
    status: "success",
    fetchStatus: "idle",
    data,
    error: null,
    refetch: jest.fn(),
  }),
  useCreateDoc: () => ({
    mutateAsync: (...a: unknown[]) => mutateAsync(...a),
    isPending: false,
  }),
  useTrashDoc: () => ({ mutateAsync: jest.fn() }),
  useDuplicateDoc: () => ({ mutateAsync: jest.fn() }),
  useUpdateDoc: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({
    ...projectsState,
    data: projectsState.isPending
      ? undefined
      : [
          { id: "ops", name: "Operations", color: "#d80", archived: false },
          { id: "old", name: "Old", color: "#0a0", archived: true },
        ],
  }),
}));

const doc = (id: string, over: Partial<V3Doc> = {}): V3Doc => ({
  id,
  title: id,
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
  ...over,
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockClear();
  mutateAsync.mockReset().mockResolvedValue({ result: null });
  search = "";
  projectsState = { isPending: false, isError: false };
  window.localStorage.clear();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

const mount = (docs: V3Doc[], ui: "phone" | "desktop") => {
  data = docs;
  act(() =>
    root.render(
      h(PhoneUiProvider, { value: ui }, h(V3PortalScope, null, h(DocsFace)))
    )
  );
};
const click = (el: Element) =>
  act(() => {
    (el as HTMLElement).click();
  });
const folder = (key: string) =>
  host.querySelector<HTMLElement>(`[data-docs-folder="${key}"]`);

const mixed = () => [
  doc("a", { projectId: "ops", updatedAt: "2026-11-10T10:00:00.000Z" }),
  doc("b", { projectId: "ops", updatedAt: "2026-11-12T10:00:00.000Z" }),
  doc("loose"),
  doc("bin", { projectId: "ops", trashedAt: "2026-11-13T10:00:00.000Z" }),
];

describe.each(["desktop", "phone"] as const)("Docs folders, %s", (ui) => {
  it("draws a folder per group: label, count, caption, project colour; Unsorted for the rest", () => {
    mount(mixed(), ui);
    const ops = folder("ops")!;
    expect(ops.textContent).toContain("Operations");
    expect(ops.textContent).toContain("2");
    expect(ops.textContent).toContain("Updated");
    expect(ops.getAttribute("aria-label")).toBe("Open Operations, 2 pages");
    expect(ops.style.getPropertyValue("--nx-folder-hue")).toBe("#d80");
    expect(folder("unsorted")!.textContent).toContain("Unsorted");
    expect(folder("unsorted")!.getAttribute("aria-label")).toBe(
      "Open Unsorted, 1 page"
    );
    expect(host.querySelector(".is-folders")).not.toBeNull();
  });

  it("a click opens that group's list; Back returns to the folders", () => {
    mount(mixed(), ui);
    click(folder("ops")!);
    expect(host.querySelector("[data-docs-folders]")).toBeNull();
    const back = host.querySelector<HTMLElement>(
      ui === "phone" ? "[data-pd-back]" : "[data-docs-back]"
    )!;
    expect(back).not.toBeNull();
    const card = (id: string) =>
      host.querySelector(`[data-ctx-id="${id}"], [data-pd-card="${id}"]`);
    expect(card("b")).not.toBeNull();
    expect(card("loose")).toBeNull();
    click(back);
    expect(folder("ops")).not.toBeNull();
  });

  it("one group alone is the list, not a lone folder", () => {
    mount([doc("a"), doc("b")], ui);
    expect(host.querySelector("[data-docs-folders]")).toBeNull();
  });

  it("one group alone renders the list of its pages", () => {
    mount([doc("a"), doc("b")], ui);
    const card = (id: string) =>
      host.querySelector(`[data-ctx-id="${id}"], [data-pd-card="${id}"]`);
    expect(card("a")).not.toBeNull();
    expect(card("b")).not.toBeNull();
  });

  it("waits for the projects instead of flashing the flat list; a failed load falls back to it", () => {
    projectsState = { isPending: true, isError: false };
    mount(mixed(), ui);
    expect(host.querySelector("[data-docs-folders]")).toBeNull();
    expect(host.querySelector("[data-ctx-id], [data-pd-card]")).toBeNull();
    expect(host.querySelector('[data-st-state="loading"]')).not.toBeNull();
    projectsState = { isPending: false, isError: true };
    mount(mixed(), ui);
    expect(host.querySelector("[data-docs-folders]")).toBeNull();
    expect(
      host.querySelector('[data-ctx-id="loose"], [data-pd-card="loose"]')
    ).not.toBeNull();
  });

  it("a project missing from the list and an archived one get their own folders; Unsorted only holds projectless pages", () => {
    mount(
      [
        doc("a", { projectId: "theirs" }),
        doc("b", { projectId: "old" }),
        doc("c"),
      ],
      ui
    );
    expect(folder("theirs")!.textContent).toContain("Project");
    expect(folder("old")!.textContent).toContain("Old");
    expect(folder("unsorted")!.getAttribute("aria-label")).toBe(
      "Open Unsorted, 1 page"
    );
  });

  it("New doc inside a project's folder is created in that project; not in Unsorted or at the top", async () => {
    const newBtn = () =>
      host.querySelector<HTMLElement>(
        ui === "phone" ? "[data-pd-new]" : '[data-rich="New Doc"]'
      )!;
    mount(mixed(), ui);
    click(folder("ops")!);
    click(newBtn());
    expect(mutateAsync).toHaveBeenLastCalledWith({
      draft: { title: "", projectId: "ops" },
    });
    await act(async () => {});
    click(host.querySelector<HTMLElement>("[data-pd-back], [data-docs-back]")!);
    click(folder("unsorted")!);
    mutateAsync.mockClear();
    click(newBtn());
    expect(mutateAsync).toHaveBeenLastCalledWith({ draft: { title: "" } });
  });

  it("keeps the open folder in the URL, and reads it back", () => {
    mount(mixed(), ui);
    click(folder("ops")!);
    expect(push).toHaveBeenCalledWith("/pages?folder=ops", { scroll: false });
    click(host.querySelector<HTMLElement>("[data-pd-back], [data-docs-back]")!);
    expect(push).toHaveBeenLastCalledWith("/pages", { scroll: false });
    act(() => root.unmount());
    root = createRoot(host);
    search = "folder=ops";
    mount(mixed(), ui);
    expect(host.querySelector("[data-docs-folders]")).toBeNull();
    expect(
      host.querySelector('[data-ctx-id="b"], [data-pd-card="b"]')
    ).not.toBeNull();
    // an unknown id is the top level
    act(() => root.unmount());
    root = createRoot(host);
    search = "folder=nope";
    mount(mixed(), ui);
    expect(folder("ops")).not.toBeNull();
  });
});
