/**
 * @jest-environment jsdom
 *
 * Docs as folders, desktop and phone: pages in two or more groups open as
 * folders (project colour, count, "Updated" caption, Unsorted for the rest);
 * a click opens that group's list and Back returns; one group alone shows
 * the list straight away.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";

import { V3PortalScope } from "../../ctx/PortalScope";
import { DocsFace } from "../../phone/docs/Faces";
import { PhoneUiProvider } from "../../root/phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/pages",
}));

let data: V3Doc[] = [];
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDocs: () => ({
    status: "success",
    fetchStatus: "idle",
    data,
    error: null,
    refetch: jest.fn(),
  }),
  useCreateDoc: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useTrashDoc: () => ({ mutateAsync: jest.fn() }),
  useDuplicateDoc: () => ({ mutateAsync: jest.fn() }),
  useUpdateDoc: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({
    data: [{ id: "ops", name: "Operations", color: "#d80" }],
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
});
