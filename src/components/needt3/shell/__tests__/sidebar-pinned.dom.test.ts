/**
 * @jest-environment jsdom
 *
 * The sidebar's Pinned list: each row wears the page's own face (its ground
 * and its title and first lines, drawn small) instead of the generic document
 * glyph (prototype `PinnedFace`).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";

import { Sidebar } from "../Sidebar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/pages",
}));
jest.mock("../useSidebarPrefs", () => {
  const places = jest.requireActual("../places");
  return {
    useSidebarPrefs: () => [places.prefsFromSettings(undefined), jest.fn()],
  };
});

let docs: V3Doc[] = [];
const none = { data: [] as unknown[], isLoading: false };
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDocs: () => ({ data: docs, isLoading: false }),
  useCreateDoc: () => ({ mutateAsync: jest.fn() }),
  useUpdateDoc: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/needt3/hooks/tasks", () => ({ useTasks: () => none }));
jest.mock("@/lib/needt3/hooks/projects", () => ({ useProjects: () => none }));
jest.mock("@/lib/needt3/hooks/events", () => ({ useEvents: () => none }));
jest.mock("@/lib/needt3/hooks/mail", () => ({ useMail: () => none }));
jest.mock("@/lib/needt3/hooks/connections", () => ({
  useConnections: () => none,
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useTimeZone: () => "UTC",
  useSettings: () => ({ data: undefined }),
  useSetPref: () => jest.fn(),
}));
jest.mock("../AccountMenu", () => ({ AccountMenu: () => null }));
jest.mock("../PlaceGlyph", () => ({ PlaceGlyph: () => null }));
jest.mock("../../document/DocRail", () => ({ DocSwitch: () => null }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));
jest.mock("../../ctx/registry", () => ({ registerCtx: () => () => undefined }));
jest.mock("../../document/open-doc", () => ({ useOpenDocId: () => null }));

const doc = (id: string, over: Partial<V3Doc> = {}): V3Doc => ({
  id,
  title: id,
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: null,
  updatedAt: null,
  ...over,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (list: V3Doc[]) => {
  docs = list;
  act(() => root.render(h(Sidebar)));
};
const row = (id: string) =>
  host.querySelector<HTMLElement>(`[data-ctx="doc"][data-ctx-id="${id}"]`);

describe("Sidebar Pinned", () => {
  it("a pinned row draws the page's face with its first lines", () => {
    mount([
      doc("Buy-list", {
        isFavorite: true,
        preview: [
          { type: "todo", text: "Milk" },
          { type: "todo", text: "Eggs", checked: true },
        ],
      }),
      doc("Not pinned", { preview: [{ type: "p", text: "elsewhere" }] }),
    ]);
    const pinned = row("Buy-list")!;
    expect(pinned).not.toBeNull();
    expect(row("Not pinned")).toBeNull();
    const face = pinned.querySelector(".shell-pinned-face-grid .docs-thumb");
    expect(face).not.toBeNull();
    // Title and both to-dos are on the face; no generic document glyph.
    const mini = face!.querySelector("[data-docs-thumb-mini]")!;
    expect(mini.textContent).toContain("Buy-list");
    expect(mini.textContent).toContain("Milk");
    expect(mini.textContent).toContain("Eggs");
    expect(mini.querySelectorAll(".docs-mini-todo")).toHaveLength(2);
    expect(mini.querySelectorAll(".docs-mini-todo.is-on")).toHaveLength(1);
    expect(pinned.querySelector(".sb-row-icon > svg")).toBeNull();
  });

  it("a pinned page with no lines yet shows its title on the face, not a blank", () => {
    mount([doc("Empty", { isFavorite: true, preview: [] })]);
    const mini = row("Empty")!.querySelector("[data-docs-thumb-mini]")!;
    expect(mini.textContent).toBe("Empty");
  });
});
