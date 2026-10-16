/**
 * @jest-environment jsdom
 *
 * The page editor as a person uses it: the "/" menu opens after a word, a
 * link goes onto selected text with Mod+K, an image pasted into the page is
 * uploaded and becomes a block, and a `#blockId` address scrolls to and marks
 * its block. The real PageWorkspace is mounted; only the network is faked.
 */
import { act, createElement as h } from "react";

import { Editor, type JSONContent } from "@tiptap/core";
import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "@/components/needt3/ctx/PortalScope";

import { LEGACY_PAGE_BLOCKS } from "@/lib/pages/__tests__/fixtures/legacy-blocks";

import { PageWorkspace } from "../PageWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => {
  const router = { push: jest.fn(), replace: jest.fn() };
  return { useRouter: () => router };
});
jest.mock("lucide-react", () => {
  const icon = () => null;
  return new Proxy(
    { __esModule: true },
    { get: (t, k) => (k in t ? (t as never)[k] : icon) }
  );
});
jest.mock("@/components/pages/DatabaseWorkspace", () => ({
  DatabaseWorkspace: () => null,
}));
jest.mock("@/lib/notifications", () => ({
  notify: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const reply = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const paragraph = (id: string, text: string) => ({
  id,
  parentBlockId: null,
  type: "PARAGRAPH",
  position: id === "blk-1" ? 1024 : 2048,
  content: {
    json: { type: "paragraph", content: [{ type: "text", text }] },
  },
});

const page = (blocks: unknown[] = []) => ({
  id: "p1",
  parentId: null,
  title: "Notes",
  icon: null,
  isPrivate: false,
  isFavorite: false,
  contentRevision: 1,
  updatedAt: "2026-10-12T09:40:00.000Z",
  database: null,
  accessRole: "FULL_ACCESS",
  userId: "u1",
  workspaceId: "w1",
  coverUrl: null,
  blocks,
  children: [],
});

let host: HTMLDivElement;
let root: Root;
let loaded: ReturnType<typeof page>;
let uploads: number;

beforeEach(() => {
  uploads = 0;
  loaded = page();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  (global as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/pages/p1" && method === "GET")
        return reply(200, { page: loaded });
      if (url.endsWith("/collaboration-token")) return reply(404, {});
      if (url === "/api/pages/p1/assets" && method === "POST") {
        uploads += 1;
        return reply(200, {
          asset: { id: "a1", originalName: "shot.png", mimeType: "image/png" },
          url: "/api/pages/p1/assets/a1",
        });
      }
      return reply(200, { folders: [], tags: [], pages: [] });
    }
  );
  window.matchMedia =
    window.matchMedia ||
    ((q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList);
  // jsdom has no layout: ProseMirror asks ranges for rectangles.
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as never;
  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Element.prototype.scrollIntoView = jest.fn();
  // jsdom ships without structuredClone, which the document loader uses.
  (globalThis as { structuredClone?: unknown }).structuredClone = (
    v: unknown
  ) => JSON.parse(JSON.stringify(v));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const mount = async () => {
  await act(async () => {
    root.render(h(V3PortalScope, null, h(PageWorkspace, { pageId: "p1" })));
  });
  await wait(60);
};

const editorOf = () =>
  (
    host.querySelector(".needt-page-editor") as
      | (HTMLElement & { editor: Editor })
      | null
  )?.editor as Editor;

const menu = () => document.querySelector('[aria-label="Page commands"]');
const key = (editor: Editor, init: KeyboardEventInit) =>
  act(async () => {
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
    );
  });

describe("the slash menu", () => {
  it("opens after a word, not only in an empty block", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("hello /");
    });
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain("Heading 1");
  });

  it("does not open inside a word or a web address", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("see https://example.com/");
    });
    expect(menu()).toBeNull();
  });

  it("says when nothing matches, and Enter then stays an ordinary Enter", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("/qqq");
    });
    expect(menu()?.textContent).toContain("No blocks match");
    await key(editor, { key: "Enter" });
    expect(menu()).toBeNull();
    expect(editor.getText()).toContain("/qqq");
  });

  it("replaces only the typed /word with the chosen block", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("Plan /head");
    });
    await key(editor, { key: "Enter" });
    const first = (editor.getJSON() as JSONContent).content?.[0];
    expect(first?.type).toBe("heading");
    expect(first?.content?.[0].text).toBe("Plan ");
  });
});

describe("a link on selected text", () => {
  it("Mod+K asks for an address and wraps the selected text", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("read the docs now");
      editor.commands.setTextSelection({ from: 10, to: 14 });
    });
    await key(editor, { key: "k", metaKey: true });
    const input = document.getElementById(
      "page-link-href"
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await act(async () => {
      set.call(input, "example.com");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input!.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    const text = (editor.getJSON() as JSONContent).content?.[0].content ?? [];
    const linked = text.find((node) =>
      node.marks?.some((mark) => mark.type === "link")
    );
    expect(linked?.text).toBe("docs");
    expect(linked?.marks?.[0].attrs?.href).toBe("https://example.com");
    // It is a mark on the words, not a separate block.
    expect(
      editor.getJSON().content?.some((n) => n.type === "needtPageBlock")
    ).toBe(false);
  });

  it("refuses an unsafe address and leaves the text alone", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("click here");
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    await key(editor, { key: "k", ctrlKey: true });
    const input = document.getElementById("page-link-href") as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await act(async () => {
      set.call(input, "javascript:alert(1)");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');
  });

  it("leaves Mod+K to the palette when nothing is selected", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("plain");
    });
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      editor.view.dom.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(document.getElementById("page-link-href")).toBeNull();
  });
});

describe("images pasted into the page", () => {
  it("uploads through the page assets route and inserts an image block", async () => {
    await mount();
    const editor = editorOf();
    const file = new File(["png"], "image.png", { type: "image/png" });
    const preventDefault = jest.fn();
    let handled: unknown;
    await act(async () => {
      handled = editor.view.someProp("handlePaste", (f) =>
        f(
          editor.view,
          {
            clipboardData: { files: [file], items: [] },
            preventDefault,
          } as never,
          null as never
        )
      );
    });
    await wait(30);
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(uploads).toBe(1);
    const block = editor
      .getJSON()
      .content?.find((node) => node.type === "needtPageBlock");
    expect(block?.attrs?.kind).toBe("IMAGE");
    expect(JSON.parse(String(block?.attrs?.data))).toMatchObject({
      url: "/api/pages/p1/assets/a1",
      assetId: "a1",
    });
  });

  it("lets text and non-image files paste as before", async () => {
    await mount();
    const editor = editorOf();
    const handled = editor.view.someProp("handlePaste", (f) =>
      f(
        editor.view,
        {
          clipboardData: {
            files: [new File(["x"], "a.pdf", { type: "application/pdf" })],
            items: [],
            getData: () => "",
          },
          preventDefault: jest.fn(),
        } as never,
        null as never
      )
    );
    expect(handled).toBeFalsy();
    expect(uploads).toBe(0);
  });
});

describe("opening a block by its link", () => {
  it("scrolls to the block named in the address and marks it", async () => {
    loaded = page([paragraph("blk-1", "First"), paragraph("blk-2", "Second")]);
    window.history.replaceState(null, "", "/pages/p1#blk-2");
    await mount();
    await wait(200);
    const marked = host.querySelectorAll("[data-block-flash]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe("Second");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does nothing for an address with no such block", async () => {
    loaded = page([paragraph("blk-1", "First")]);
    window.history.replaceState(null, "", "/pages/p1#nope");
    await mount();
    await wait(100);
    expect(host.querySelectorAll("[data-block-flash]")).toHaveLength(0);
  });
});

describe("Callout, Toggle and Columns from the slash menu", () => {
  it("Toggle goes in as a real toggle with the caret in its title", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("/toggle");
    });
    await key(editor, { key: "Enter" });
    expect(host.querySelector(".needt-toggle")).not.toBeNull();
    // No dialog asking for text first, and typing goes into the title.
    expect(document.getElementById("page-block-value")).toBeNull();
    await act(async () => {
      editor.commands.insertContent("Details");
    });
    const first = (editor.getJSON() as JSONContent).content?.[0];
    expect(first?.type).toBe("needtToggle");
    expect(first?.content?.[0].content?.[0].text).toBe("Details");
    // The toggle has an id like every other block.
    expect(typeof first?.attrs?.blockId).toBe("string");
  });

  it("Callout and Columns go in empty and typeable", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertContent("/callout");
    });
    await key(editor, { key: "Enter" });
    await act(async () => {
      editor.commands.insertContent("Heads up");
    });
    await act(async () => {
      editor.commands.focus("end");
      editor.commands.insertContent("/split");
    });
    await key(editor, { key: "Enter" });
    await act(async () => {
      editor.commands.insertContent("Left");
    });
    const types = (editor.getJSON() as JSONContent).content?.map((n) => n.type);
    expect(types).toContain("needtCallout");
    expect(types).toContain("needtColumns");
    expect(editor.getText()).toContain("Heads up");
    expect(editor.getText()).toContain("Left");
    expect(host.querySelectorAll(".needt-column")).toHaveLength(2);
  });
});

describe("a page saved with the old atoms", () => {
  it("opens with editable Callout, Toggle and Columns", async () => {
    loaded = page(LEGACY_PAGE_BLOCKS as never);
    await mount();
    const editor = editorOf();
    expect(
      host.querySelector(".needt-callout .needt-callout-body")?.textContent
    ).toBe("Ship on the 26th");
    expect(host.querySelector(".needt-toggle")).not.toBeNull();
    expect(host.querySelectorAll(".needt-column")).toHaveLength(2);
    // The link block, which was not part of this change, is still an atom.
    expect(host.querySelector('[data-needt-page-block="LINK"]')).not.toBeNull();
    // And the callout takes an edit.
    await act(async () => {
      editor.commands.setTextSelection(3);
      editor.commands.insertContent("!");
    });
    expect(host.querySelector(".needt-callout-body")?.textContent).toContain(
      "!"
    );
  });
});

describe("the table bar", () => {
  it("shows its actions while the caret is in a table and runs them", async () => {
    await mount();
    const editor = editorOf();
    await act(async () => {
      editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      editor.commands.setTextSelection(3);
    });
    await wait(60);
    const bar = document.querySelector('[aria-label="Table actions"]');
    expect(bar).not.toBeNull();
    const labels = Array.from(bar!.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label")
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Add row below",
        "Add column right",
        "Delete table",
        "Header row",
      ])
    );
    expect(
      bar!
        .querySelector('[data-table-action="headerRow"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");
    await act(async () => {
      bar!
        .querySelector<HTMLButtonElement>('[data-table-action="rowBelow"]')!
        .click();
    });
    const rows = (editor.getJSON() as JSONContent).content?.find(
      (n) => n.type === "table"
    )?.content;
    expect(rows).toHaveLength(3);
  });
});
