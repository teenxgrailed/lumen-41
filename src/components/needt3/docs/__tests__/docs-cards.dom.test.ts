/**
 * @jest-environment jsdom
 *
 * The desktop Docs grid over mocked data hooks: each card draws the page's
 * first blocks in miniature (every row type), keeps the project line, the
 * "Updated" line and the star, draws nothing for an empty page, and never
 * turns preview text into markup.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";
import type { PagePreviewBlock } from "@/lib/pages/page-preview";

import { V3PortalScope } from "../../ctx/PortalScope";
import { type CtxMenu, ctxMenuFor } from "../../ctx/registry";
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
const updateDoc = jest.fn();
const duplicateDoc = jest.fn();
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
  useDuplicateDoc: () => ({
    mutateAsync: (...a: unknown[]) => duplicateDoc(...a),
  }),
  useUpdateDoc: () => ({ mutateAsync: (...a: unknown[]) => updateDoc(...a) }),
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

const ALL: PagePreviewBlock[] = [
  { type: "h2", text: "Scope" },
  { type: "p", text: "A paragraph." },
  { type: "lead", text: "A lead." },
  { type: "li", text: "bullet one" },
  { type: "ol", text: "step one" },
  { type: "ol", text: "step two" },
  { type: "todo", text: "ticked", checked: true },
  { type: "todo", text: "open" },
  { type: "quote", text: "quoted" },
  { type: "callout", text: "called out" },
  { type: "code", text: "let a = 1;" },
  { type: "rule", text: "" },
  { type: "image", text: "" },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockClear();
  updateDoc.mockReset();
  updateDoc.mockResolvedValue({ undo: jest.fn() });
  duplicateDoc.mockReset();
  duplicateDoc.mockResolvedValue({ undo: jest.fn() });
  window.localStorage.clear();
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

const mount = (docs: V3Doc[]) => {
  data = docs;
  act(() =>
    root.render(
      h(
        PhoneUiProvider,
        { value: "desktop" },
        h(V3PortalScope, null, h(DocsFace))
      )
    )
  );
};
const card = (id: string) =>
  host.querySelector<HTMLElement>(`.docs-card[data-ctx-id="${id}"]`)!;

describe("desktop Docs card miniature", () => {
  it("draws every row type of the preview inside the card page", () => {
    mount([doc("all", { preview: ALL })]);
    const mini = card("all").querySelector(
      ".docs-doc-card-7 [data-docs-mini]"
    )!;
    expect(mini).not.toBeNull();
    expect(mini.getAttribute("aria-hidden")).toBe("true");

    expect(mini.querySelector(".docs-mini-block-1")?.textContent).toBe("Scope");
    expect(mini.querySelector("p.docs-mini-p")?.textContent).toBe(
      "A paragraph."
    );
    expect(mini.querySelector(".docs-mini-lead")?.textContent).toBe("A lead.");
    const lis = Array.from(mini.querySelectorAll(".docs-mini-li")).map(
      (e) => e.textContent
    );
    expect(lis).toEqual(["•bullet one", "1.step one", "2.step two"]);
    const todos = Array.from(mini.querySelectorAll(".docs-mini-todo"));
    expect(todos.map((t) => t.classList.contains("is-on"))).toEqual([
      true,
      false,
    ]);
    expect(
      todos[0].querySelector(".docs-mini-block-3")?.classList.contains("is-on")
    ).toBe(true);
    expect(mini.querySelector(".docs-mini-quote")?.textContent).toBe("quoted");
    expect(mini.querySelector(".docs-mini-block-2")?.textContent).toBe(
      "called out"
    );
    expect(mini.querySelector(".docs-mini-code")?.textContent).toBe(
      "let a = 1;"
    );
    expect(mini.querySelector(".docs-mini-block-4")).not.toBeNull();
    expect(mini.querySelector(".docs-mini-block-5")).not.toBeNull();
  });

  it("keeps the title, the project line, the Updated line and the star", () => {
    mount([
      doc("Launch brief", {
        projectId: "ops",
        isFavorite: true,
        updatedAt: "2026-10-05T10:00:00.000Z",
        preview: [{ type: "p", text: "Words" }],
      }),
    ]);
    const c = card("Launch brief");
    expect(c.querySelector(".docs-card-title")?.textContent).toBe(
      "Launch brief"
    );
    expect(c.querySelector(".docs-doc-meta-2")?.textContent).toBe("Operations");
    expect(c.querySelector(".docs-doc-meta-4")?.textContent).toMatch(
      /^Updated /
    );
    const star = c.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.getAttribute("aria-label")).toBe("Unpin");
    expect(star.parentElement?.classList.contains("is-on")).toBe(true);
    act(() => star.click());
    expect(updateDoc).toHaveBeenCalledWith({
      id: "Launch brief",
      patch: { isFavorite: false },
    });
    // The star does not open the page.
    expect(push).not.toHaveBeenCalled();
  });

  it("draws no miniature for an empty page or one the server sent none for", () => {
    mount([
      doc("empty", { preview: [] }),
      doc("none"), // an older server: no preview field
      doc("title only", { title: "", preview: [] }),
    ]);
    expect(host.querySelectorAll(".docs-card")).toHaveLength(3);
    expect(host.querySelector("[data-docs-mini]")).toBeNull();
    // The empty card still has its body and the untitled name.
    expect(
      card("title only").querySelector(".docs-card-title.is-untitled")
        ?.textContent
    ).toBe("Untitled Document");
    expect(card("empty").querySelector(".docs-doc-card-7")).not.toBeNull();
  });

  it("renders preview text as text, never as markup", () => {
    const evil = '<img src=x onerror="window.__pwned = 1"><b>bold</b>';
    mount([
      doc("evil", {
        preview: [
          { type: "p", text: evil },
          { type: "li", text: evil },
          { type: "code", text: evil },
        ],
      }),
    ]);
    const mini = card("evil").querySelector("[data-docs-mini]")!;
    expect(mini.querySelector("img, b, script")).toBeNull();
    expect(mini.textContent).toContain(evil);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("opens the page from the miniature like from the rest of the card", () => {
    mount([doc("open me", { preview: [{ type: "p", text: "Words" }] })]);
    act(() =>
      card("open me").querySelector<HTMLElement>(".docs-mini-p")!.click()
    );
    expect(push).toHaveBeenCalledWith("/pages/open%20me");
  });

  it("the list view draws each row's face with the page's title and first lines", () => {
    mount([
      doc("Buy-list", {
        preview: [
          { type: "todo", text: "Milk" },
          { type: "todo", text: "Eggs", checked: true },
        ],
      }),
      doc("Blank", { preview: [] }),
    ]);
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="List"]')!
        .click()
    );
    const rows = host.querySelectorAll<HTMLElement>(".docs-doc-list-2");
    expect(rows).toHaveLength(2);
    const mini = Array.from(rows)
      .find((r) => r.textContent?.includes("Buy-list"))!
      .querySelector("[data-docs-thumb-mini]")!;
    expect(mini.textContent).toContain("Milk");
    expect(mini.querySelectorAll(".docs-mini-todo.is-on")).toHaveLength(1);
    // A blank page still shows its title on the face, not an empty sheet.
    const blank = Array.from(rows)
      .find((r) => r.getAttribute("data-ctx-id") === "Blank")!
      .querySelector("[data-docs-thumb-mini]")!;
    expect(blank.textContent).toBe("Blank");
  });
});

describe("desktop Docs card menu (right-click)", () => {
  const labels = (menu: CtxMenu | null) =>
    (menu ?? []).map((g) => g.map((r) => r.label));

  it("has the shared set: Rename, Move to project…, Pin, Duplicate, Share…, Copy link, Move to Trash", () => {
    mount([doc("a", { title: "Alpha" })]);
    const menu = ctxMenuFor(card("a"));
    expect(labels(menu)).toEqual([
      ["Open", "Open in New Tab"],
      ["Rename", "Move to project…", "Pin", "Duplicate"],
      ["Share…", "Copy link"],
      ["Move to Trash"],
    ]);
    expect(menu![3][0].tone).toBe("danger");
  });

  it("Move to project… carries the projects and ticks the current one", () => {
    mount([doc("a", { title: "Alpha", projectId: "ops" })]);
    const move = ctxMenuFor(card("a"))![1][1];
    expect(move.hint).toBe("›");
    expect(move.sub?.map((r) => [r.label, r.hint])).toEqual([
      ["No project", undefined],
      ["Operations", "✓"],
    ]);
    act(() => move.sub![0].run!());
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { projectId: null },
    });
  });

  it("Duplicate and Pin go through the page API hooks", async () => {
    mount([doc("a", { title: "Alpha" })]);
    const menu = ctxMenuFor(card("a"))!;
    await act(async () => menu[1][3].run!());
    expect(duplicateDoc).toHaveBeenCalledWith({ id: "a" });
    await act(async () => menu[1][2].run!());
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { isFavorite: true },
    });
  });

  it("Rename opens the sheet with the name and writes the new one", async () => {
    mount([doc("a", { title: "Alpha" })]);
    act(() => ctxMenuFor(card("a"))![1][0].run!());
    const input =
      document.querySelector<HTMLInputElement>(".docs-rename-input")!;
    expect(input.value).toBe("Alpha");
    act(() => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      set.call(input, "Alpha 2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { title: "Alpha 2" },
    });
  });
});
