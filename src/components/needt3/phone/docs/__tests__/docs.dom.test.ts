/**
 * @jest-environment jsdom
 *
 * The phone Docs home, mounted over mocked data hooks: the grid and its sub
 * line, the sort menu (the desktop's stored sort), Quick Open, New doc and
 * From template, a card opening its page, a failed load (retry), no access,
 * and one create at a time.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Doc } from "@/lib/needt3/map";

import { PhoneUiProvider } from "../../../root/phone-ui-context";
import { DocsFace } from "../Faces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// StScreen reads the flag from V3Root, which pulls in the whole frame and its CSS.
jest.mock("../../../root/V3Root", () => ({ useDesignV3: () => true }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/pages",
}));

interface Q {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  data: V3Doc[] | undefined;
  error: unknown;
  refetch: jest.Mock;
}
let query: Q;
const mutateAsync = jest.fn();
const updateDoc = jest.fn();
const duplicateDoc = jest.fn();
let creating = false;
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useDocs: () => query,
  useCreateDoc: () => ({
    mutateAsync: (...a: unknown[]) => mutateAsync(...a),
    isPending: creating,
  }),
  useTrashDoc: () => ({ mutateAsync: jest.fn() }),
  useDuplicateDoc: () => ({
    mutateAsync: (...a: unknown[]) => duplicateDoc(...a),
  }),
  useUpdateDoc: () => ({ mutateAsync: (...a: unknown[]) => updateDoc(...a) }),
}));
jest.mock("@/lib/needt3/hooks/projects", () => ({
  useProjects: () => ({
    data: [{ id: "p1", name: "Home", color: "#2a7" }],
  }),
}));

const doc = (id: string, title: string, over: Partial<V3Doc> = {}): V3Doc => ({
  id,
  title,
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

const ok = (data: V3Doc[]): Q => ({
  status: "success",
  fetchStatus: "idle",
  data,
  error: null,
  refetch: jest.fn(),
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
  mutateAsync.mockReset();
  updateDoc.mockReset().mockResolvedValue({ undo: jest.fn() });
  duplicateDoc.mockReset().mockResolvedValue({ undo: jest.fn() });
  creating = false;
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

let ui: "phone" | "desktop" = "phone";
const render = () =>
  act(() => root.render(h(PhoneUiProvider, { value: ui }, h(DocsFace))));
const mount = () => {
  ui = "phone";
  render();
};
const swap = (to: "phone" | "desktop") => {
  ui = to;
  render();
};
const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const titles = () =>
  Array.from(host.querySelectorAll(".pd-card-title")).map((e) =>
    (e.textContent ?? "").trim()
  );
const click = (el: Element) =>
  act(() => {
    (el as HTMLElement).click();
  });
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const three = () => [
  doc("a", "Alpha", {
    updatedAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
  }),
  doc("b", "Bravo", {
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:00.000Z",
    isFavorite: true,
    projectId: "p1",
  }),
  doc("c", "", {
    updatedAt: "2026-10-05T10:00:00.000Z",
    createdAt: "2026-10-03T10:00:00.000Z",
  }),
  doc("t", "In the bin", { trashedAt: "2026-10-09T10:00:00.000Z" }),
];

describe("Docs home", () => {
  it("lists live docs newest first with the sub line, pin and project", () => {
    query = ok(three());
    mount();
    expect(titles()).toEqual(["Bravo", "Untitled", "Alpha"]);
    expect($(".pk-sub").textContent).toBe("3 documents · Recently edited");
    expect($("[data-pd-card='b'] .pd-pin")).not.toBeNull();
    expect($("[data-pd-card='b'] .pd-card-proj").textContent).toBe("Home");
  });

  it("a card draws the page's first blocks under its title", () => {
    query = ok([
      doc("a", "Alpha", {
        preview: [
          { type: "h2", text: "Scope" },
          { type: "todo", text: "Ticked", checked: true },
          { type: "li", text: "A bullet" },
        ],
      }),
      doc("b", "Bravo", { preview: [] }),
      doc("c", "Charlie"),
    ]);
    mount();
    const mini = (id: string) =>
      host.querySelector(`[data-pd-card='${id}'] .pd-card-mini`)!;
    expect(mini("a").querySelector(".docs-mini-doc-2")?.textContent).toBe(
      "Alpha"
    );
    expect(mini("a").querySelector(".docs-mini-block-1")?.textContent).toBe(
      "Scope"
    );
    expect(mini("a").querySelectorAll(".docs-mini-todo.is-on")).toHaveLength(1);
    expect(mini("a").querySelector(".docs-mini-li")?.textContent).toBe(
      "•A bullet"
    );
    // An empty page and a doc with no preview field keep the title alone.
    expect(mini("b").querySelectorAll(".docs-mini-doc-1 > *")).toHaveLength(1);
    expect(mini("c").querySelectorAll(".docs-mini-doc-1 > *")).toHaveLength(1);
  });

  it("a card opens its page", () => {
    query = ok(three());
    mount();
    click($("[data-pd-card='a']"));
    expect(push).toHaveBeenCalledWith("/pages/a");
  });

  it("the ⋯ menu sorts by the desktop's keys and remembers the choice", () => {
    query = ok(three());
    mount();
    expect($("[data-pd-menu]").getAttribute("data-pd-menu")).toBe("shut");
    click($("[data-pd-more='list']"));
    expect($("[data-pd-menu]").getAttribute("data-pd-menu")).toBe("open");
    click($("[data-pd-item='sort-name']"));
    expect(titles()).toEqual(["Alpha", "Bravo", "Untitled"]);
    expect($("[data-pd-menu]").getAttribute("data-pd-menu")).toBe("shut");
    expect(JSON.parse(window.localStorage.getItem("needt.docsSort")!)).toEqual({
      key: "name",
      dir: "asc",
    });
    expect($(".pk-sub").textContent).toBe("3 documents · By name");
    // the active row again flips the direction
    click($("[data-pd-more='list']"));
    click($("[data-pd-item='sort-name']"));
    expect(titles()).toEqual(["Untitled", "Bravo", "Alpha"]);
    expect($(".pk-sub").textContent).toBe("3 documents · By name, Z to A");
  });

  it("Esc closes the ⋯ menu and gives the focus back to its chip", () => {
    query = ok(three());
    mount();
    const chip = $<HTMLElement>("[data-pd-more='list']");
    act(() => chip.focus());
    click(chip);
    expect(document.activeElement).toBe($("[data-pd-item='sort-name']"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect($("[data-pd-menu]").getAttribute("data-pd-menu")).toBe("shut");
    expect(document.activeElement).toBe(chip);
  });

  it("reads the stored sort after mount", () => {
    window.localStorage.setItem(
      "needt.docsSort",
      JSON.stringify({ key: "name", dir: "desc" })
    );
    query = ok(three());
    mount();
    expect(titles()).toEqual(["Untitled", "Bravo", "Alpha"]);
  });

  it("Quick Open narrows by title, says so when nothing matches, and clears", () => {
    query = ok(three());
    mount();
    const input = $<HTMLInputElement>("[data-pd-quickopen] input");
    type(input, "bra");
    expect(titles()).toEqual(["Bravo"]);
    type(input, "zzz");
    expect(titles()).toEqual([]);
    expect($("[data-pd-empty]").textContent).toContain("Nothing matches");
    click($(".pd-qo-clear"));
    expect(titles()).toHaveLength(3);
  });

  it("Enter in Quick Open opens the first hit", () => {
    query = ok(three());
    mount();
    const input = $<HTMLInputElement>("[data-pd-quickopen] input");
    type(input, "alp");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(push).toHaveBeenCalledWith("/pages/a");
  });

  it("New doc creates an untitled page and opens it, once at a time", async () => {
    query = ok([]);
    let done!: (v: unknown) => void;
    mutateAsync.mockReturnValue(
      new Promise((r) => {
        done = r;
      })
    );
    mount();
    expect($("[data-pd-empty]").textContent).toContain("No documents yet");
    click($("[data-pd-new]"));
    click($("[data-pd-new]"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ draft: { title: "" } });
    await act(async () => {
      done({ result: { id: "new1" }, undo: jest.fn() });
    });
    expect(push).toHaveBeenCalledWith("/pages/new1");
    // the guard lets go afterwards
    mutateAsync.mockResolvedValue({ result: { id: "new2" }, undo: jest.fn() });
    await act(async () => {
      click($("[data-pd-new]"));
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("From template goes to the templates page", () => {
    query = ok(three());
    mount();
    click($("[data-pd-new-tpl]"));
    expect(push).toHaveBeenCalledWith("/templates");
  });
});

describe("states", () => {
  it("shows the skeleton while loading", () => {
    query = {
      status: "pending",
      fetchStatus: "fetching",
      data: undefined,
      error: null,
      refetch: jest.fn(),
    };
    mount();
    expect($("[data-st-state='loading']")).not.toBeNull();
    expect(host.querySelector("[data-pd-card]")).toBeNull();
    expect(host.querySelector(".pk-sub")).toBeNull();
  });

  it("an error offers Retry", () => {
    query = {
      status: "error",
      fetchStatus: "idle",
      data: undefined,
      error: new Error("boom"),
      refetch: jest.fn(),
    };
    mount();
    expect($("[data-st-state='error']")).not.toBeNull();
    click($("[data-st-retry]"));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it("a 403 is No access, even over cached docs", () => {
    query = {
      status: "error",
      fetchStatus: "idle",
      data: three(),
      error: Object.assign(new Error("Forbidden"), { status: 403 }),
      refetch: jest.fn(),
    };
    mount();
    expect($("[data-st-noaccess]")).not.toBeNull();
    expect(host.querySelector("[data-pd-card]")).toBeNull();
  });

  it("offline with nothing cached says so", () => {
    query = {
      status: "pending",
      fetchStatus: "paused",
      data: undefined,
      error: null,
      refetch: jest.fn(),
    };
    mount();
    expect($("[data-st-state='offline']").textContent).toContain("offline");
  });
});

describe("crossing 700 px (two faces, one controller)", () => {
  // The real desktop grid is the other face. Its card order, by id.
  const deskIds = () =>
    Array.from(host.querySelectorAll("[data-ctx='doc-card']")).map((e) =>
      e.getAttribute("data-ctx-id")
    );

  it("the sort and Quick Open words survive, and the desktop grid reads the same sort", () => {
    // Storage is blocked: the controller, not localStorage, carries the sort.
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    query = ok(three());
    mount();
    click($("[data-pd-more='list']"));
    click($("[data-pd-item='sort-name']"));
    type($<HTMLInputElement>("[data-pd-quickopen] input"), "r");
    expect(titles()).toEqual(["Bravo"]);
    swap("desktop");
    expect(host.querySelector("[data-pd-card]")).toBeNull();
    expect(deskIds()).toEqual(["a", "b", "c"]); // by name, untitled last
    // the desktop's own ⋯ menu changes the shared sort
    click($("[data-docs-more]"));
    const created = Array.from(
      host.querySelectorAll<HTMLElement>("[role='menuitem']")
    ).find((e) => e.textContent?.includes("Date created"))!;
    click(created);
    expect(deskIds()).toEqual(["c", "b", "a"]); // newest created first
    swap("phone");
    expect($<HTMLInputElement>("[data-pd-quickopen] input").value).toBe("r");
    type($<HTMLInputElement>("[data-pd-quickopen] input"), "");
    expect(titles()).toEqual(["Untitled", "Bravo", "Alpha"]);
    expect($(".pk-sub").textContent).toBe("3 documents · Recently created");
  });

  it("the desktop layout switch survives a trip through the phone", () => {
    query = ok(three());
    swap("desktop");
    click($("[aria-label='List']"));
    expect($("[aria-label='List']").getAttribute("aria-pressed")).toBe("true");
    swap("phone");
    swap("desktop");
    expect($("[aria-label='List']").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".docs-list-head")).not.toBeNull();
  });

  it("never repeats a create across a swap, from either face, and still opens the new page", async () => {
    query = ok([]);
    let done!: (v: unknown) => void;
    mutateAsync.mockReturnValue(
      new Promise((r) => {
        done = r;
      })
    );
    mount();
    click($("[data-pd-new]"));
    swap("desktop");
    click($("[data-docs-empty] button"));
    swap("phone");
    click($("[data-pd-new]"));
    swap("desktop");
    click($("[data-docs-empty] button"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      done({ result: { id: "new9" }, undo: jest.fn() });
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/pages/new9");
  });

  it("a create started on the desktop grid is not repeated by the phone face", async () => {
    query = ok([]);
    let done!: (v: unknown) => void;
    mutateAsync.mockReturnValue(
      new Promise((r) => {
        done = r;
      })
    );
    swap("desktop");
    click($("[data-docs-empty] button"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    swap("phone");
    click($("[data-pd-new]"));
    swap("desktop");
    click($("[data-docs-empty] button"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      done({ result: { id: "d7" }, undo: jest.fn() });
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a tap in the first 300 ms of the page's life is not swallowed", () => {
    query = ok(three());
    jest.spyOn(performance, "now").mockReturnValue(5);
    mount();
    click($("[data-pd-card='a']"));
    click($("[data-pd-new-tpl]"));
    expect(push).toHaveBeenCalledWith("/pages/a");
    expect(push).toHaveBeenCalledWith("/templates");
  });
});

describe("Docs home: the long-press menu", () => {
  const hold = (id: string) =>
    act(() => {
      $(`[data-pd-card='${id}']`).parentElement!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );
    });
  const acts = () =>
    Array.from(host.querySelectorAll<HTMLElement>("[data-pd-act]")).map((e) =>
      e.getAttribute("data-pd-act")
    );
  const row = (id: string) => $(`[data-pd-act='${id}']`);

  it("offers the whole set in the shared order", () => {
    query = ok(three());
    mount();
    hold("a");
    expect(acts()).toEqual([
      "open",
      "rename",
      "move",
      "pin",
      "duplicate",
      "share",
      "copy-link",
      "export-md",
      "export-pdf",
      "trash",
    ]);
    expect(row("pin").textContent).toContain("Pin");
    expect(row("trash").textContent).toContain("Move to Trash");
  });

  it("a pinned doc offers Unpin", () => {
    query = ok(three());
    mount();
    hold("b");
    expect(row("pin").textContent).toContain("Unpin");
  });

  it("Rename opens a field with the name and saves the new one", async () => {
    query = ok(three());
    mount();
    hold("a");
    click(row("rename"));
    const input = $<HTMLInputElement>("[data-pd-rename] input");
    expect(input.value).toBe("Alpha");
    type(input, "  Alpha two ");
    await act(async () => {
      $("[data-pd-rename]").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { title: "Alpha two" },
    });
  });

  it("Move to project lists the projects and writes the chosen one", async () => {
    query = ok(three());
    mount();
    hold("a");
    click(row("move"));
    const lists = host.querySelectorAll(".pk-acts");
    const names = Array.from(
      lists[lists.length - 1].querySelectorAll(".pk-act-label")
    ).map((e) => e.textContent);
    expect(names).toEqual(["No project", "Home"]);
    await act(async () => {
      (
        Array.from(host.querySelectorAll<HTMLElement>(".pk-act")).find((b) =>
          b.textContent?.includes("Home")
        ) as HTMLElement
      ).click();
    });
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { projectId: "p1" },
    });
  });

  it("Duplicate and Pin call the page API hooks", async () => {
    query = ok(three());
    mount();
    hold("a");
    await act(async () => {
      (row("duplicate") as HTMLElement).click();
    });
    expect(duplicateDoc).toHaveBeenCalledWith({ id: "a" });
    hold("a");
    await act(async () => {
      (row("pin") as HTMLElement).click();
    });
    expect(updateDoc).toHaveBeenCalledWith({
      id: "a",
      patch: { isFavorite: true },
    });
  });
});

describe("Docs home: cards stay cheap", () => {
  it("a picture cover loads lazily and decodes off the main thread", () => {
    query = ok([doc("a", "Alpha", { coverUrl: "https://cdn.test/cover.png" })]);
    mount();
    const img = $<HTMLImageElement>("[data-pd-card='a'] img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("the card draws its page, cover, style, star and project from the list row alone", () => {
    query = ok([
      doc("a", "Alpha", {
        isFavorite: true,
        projectId: "p1",
        coverUrl: "art:dunes",
        style: { page: "cream", backdrop: "mist", font: "serif" },
        preview: [{ type: "p", text: "First line" }],
      }),
    ]);
    mount();
    const card = $("[data-pd-card='a']");
    expect(card.querySelector(".pd-card-pic.has-bd")).not.toBeNull();
    expect(card.querySelector(".pd-card-cover")).not.toBeNull();
    expect(card.querySelector(".pd-pin")).not.toBeNull();
    expect(card.querySelector(".pd-card-proj")?.textContent).toBe("Home");
    expect(card.querySelector(".docs-mini-p, p")?.textContent).toContain(
      "First line"
    );
  });
});
