/**
 * @jest-environment jsdom
 *
 * Toggle, Callout and Columns as the editor runs them: node views in a real
 * Tiptap editor (the same extension list the page uses), without the page
 * around it.
 */
import { Editor, type JSONContent } from "@tiptap/core";

import {
  CALLOUT_COLORS,
  CALLOUT_ICONS,
} from "@/components/pages/blocks/callout";
import {
  equalWidths,
  resizeWidths,
} from "@/components/pages/blocks/columns-ops";
import { containerBlockJson } from "@/components/pages/blocks/templates";

import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

let host: HTMLElement;
let editor: Editor;

const json = () => editor.getJSON() as JSONContent;

const make = (content: JSONContent[]) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: pageEditorExtensions,
    content: { type: "doc", content },
  });
  return editor;
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  editor?.destroy();
  host?.remove();
});

const para = (text?: string): JSONContent =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };

const toggle = (id = "t1"): JSONContent => ({
  type: "needtToggle",
  attrs: { blockId: id },
  content: [para("Title"), para("Hidden body")],
});

describe("Toggle", () => {
  it("draws a title and a body, and the arrow folds the body", () => {
    make([toggle()]);
    const dom = host.querySelector<HTMLElement>(".needt-toggle")!;
    const arrow = host.querySelector<HTMLButtonElement>(".needt-toggle-arrow")!;
    expect(dom.dataset.open).toBe("true");
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    arrow.click();
    expect(dom.dataset.open).toBe("false");
    expect(arrow.getAttribute("aria-expanded")).toBe("false");
    arrow.click();
    expect(dom.dataset.open).toBe("true");
  });

  it("remembers a folded toggle, per block, across a reload", () => {
    make([toggle("keep")]);
    host.querySelector<HTMLButtonElement>(".needt-toggle-arrow")!.click();
    editor.destroy();
    host.remove();

    make([toggle("keep"), toggle("other")]);
    const [first, second] = Array.from(
      host.querySelectorAll<HTMLElement>(".needt-toggle")
    );
    expect(first.dataset.open).toBe("false");
    expect(second.dataset.open).toBe("true");
  });

  it("folding does not edit the document", () => {
    make([toggle()]);
    const before = JSON.stringify(json());
    const updates = jest.fn();
    editor.on("update", updates);
    host.querySelector<HTMLButtonElement>(".needt-toggle-arrow")!.click();
    expect(updates).not.toHaveBeenCalled();
    expect(JSON.stringify(json())).toBe(before);
  });

  it("keeps a caret out of a folded body", () => {
    make([toggle()]);
    // inside the body paragraph
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    host.querySelector<HTMLButtonElement>(".needt-toggle-arrow")!.click();
    const { from } = editor.state.selection;
    const titleEnd = 1 + editor.state.doc.child(0).child(0).nodeSize;
    expect(from).toBeLessThanOrEqual(titleEnd);
  });

  it("holds more than text: a list inside the body", () => {
    make([
      {
        type: "needtToggle",
        attrs: { blockId: "t" },
        content: [
          para("Title"),
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [para("inside")] }],
          },
        ],
      },
    ]);
    expect(host.querySelector(".needt-toggle-content ul li")).not.toBeNull();
  });
});

describe("Callout", () => {
  const callout = (extra: Record<string, unknown> = {}): JSONContent => ({
    type: "needtCallout",
    attrs: { blockId: "c1", icon: "💡", color: "default", ...extra },
    content: [para("Mind the gap"), para("Second line")],
  });

  it("shows its icon and colour and holds editable blocks", () => {
    make([callout({ icon: "🔥", color: "navy" })]);
    const dom = host.querySelector<HTMLElement>(".needt-callout")!;
    expect(dom.dataset.color).toBe("navy");
    expect(host.querySelector(".needt-callout-icon")!.textContent).toBe("🔥");
    expect(host.querySelectorAll(".needt-callout-body p")).toHaveLength(2);
    // Typing into the body is an ordinary edit.
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("X");
    expect(editor.getText()).toContain("MXind");
  });

  it("changes icon and colour through its menu", () => {
    make([callout()]);
    const icon = host.querySelector<HTMLButtonElement>(".needt-callout-icon")!;
    const menu = host.querySelector<HTMLElement>(".needt-callout-menu")!;
    expect(menu.hidden).toBe(true);
    icon.click();
    expect(menu.hidden).toBe(false);

    const pick = menu.querySelector<HTMLButtonElement>(
      `[data-callout-icon="${CALLOUT_ICONS[3]}"]`
    )!;
    pick.click();
    expect(menu.hidden).toBe(true);
    expect(json().content?.[0].attrs?.icon).toBe(CALLOUT_ICONS[3]);

    icon.click();
    menu
      .querySelector<HTMLButtonElement>('[data-callout-color="wine"]')!
      .click();
    const attrs = json().content?.[0].attrs;
    expect(attrs?.color).toBe("wine");
    expect(attrs?.icon).toBe(CALLOUT_ICONS[3]);
    expect(
      host.querySelector<HTMLElement>(".needt-callout")!.dataset.color
    ).toBe("wine");
    // The text was not touched.
    expect(editor.getText()).toContain("Mind the gap");
  });

  it("offers the document colours and no others", () => {
    make([callout()]);
    const offered = Array.from(
      host.querySelectorAll("[data-callout-color]")
    ).map((el) => el.getAttribute("data-callout-color"));
    expect(offered).toEqual([...CALLOUT_COLORS]);
  });

  it("ignores an unknown colour or a huge icon in stored data", () => {
    make([callout({ color: "hotpink", icon: "x".repeat(100) })]);
    const dom = host.querySelector<HTMLElement>(".needt-callout")!;
    expect(dom.dataset.color).toBe("default");
    expect(host.querySelector(".needt-callout-icon")!.textContent).toBe("💡");
  });

  it("has no picker on a read-only page", () => {
    make([callout()]);
    editor.setEditable(false);
    expect(
      host.querySelector<HTMLButtonElement>(".needt-callout-icon")!.disabled
    ).toBe(true);
  });
});

describe("Columns", () => {
  const columns = (widths: number[]): JSONContent => ({
    type: "needtColumns",
    attrs: { blockId: "cols" },
    content: widths.map((width, i) => ({
      type: "needtColumn",
      attrs: { width },
      content: [para(`col ${i + 1}`)],
    })),
  });
  const widthsNow = () =>
    json().content?.[0].content?.map((c) => c.attrs?.width as number);

  it("draws one column per child with its share of the row", () => {
    make([columns([60, 40])]);
    const cols = Array.from(
      host.querySelectorAll<HTMLElement>(".needt-column")
    );
    expect(cols.map((c) => c.getAttribute("data-width"))).toEqual(["60", "40"]);
    expect(cols.map((c) => c.style.getPropertyValue("--w"))).toEqual([
      "60",
      "40",
    ]);
    expect(host.querySelectorAll(".needt-columns-handle")).toHaveLength(1);
  });

  it("a fresh Columns block is two even, typeable columns", () => {
    make([containerBlockJson("COLUMNS")]);
    expect(widthsNow()).toEqual([50, 50]);
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("hi");
    expect(editor.getText()).toContain("hi");
  });

  it("the divider moves with the arrow keys, between its two columns only", () => {
    make([columns([34, 33, 33])]);
    const handle = host.querySelector<HTMLElement>(
      '.needt-columns-handle[data-handle="0"]'
    )!;
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(widthsNow()).toEqual([36, 31, 33]);
    // Never below 15% of the row.
    for (let i = 0; i < 30; i += 1) {
      host
        .querySelector<HTMLElement>('.needt-columns-handle[data-handle="0"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
        );
    }
    const now = widthsNow()!;
    expect(now[0]).toBeGreaterThanOrEqual(15);
    expect(now[2]).toBe(33);
    expect(Math.round(now.reduce((a, b) => a + b, 0))).toBe(100);
  });

  it("drags a divider with the pointer and writes the result once", () => {
    make([columns([50, 50])]);
    const row = host.querySelector<HTMLElement>(".needt-columns")!;
    row.getBoundingClientRect = () =>
      ({
        width: 400,
        left: 0,
        right: 400,
        top: 0,
        bottom: 10,
        height: 10,
      }) as DOMRect;
    const handle = host.querySelector<HTMLElement>(".needt-columns-handle")!;
    const updates = jest.fn();
    editor.on("update", updates);
    const pointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientX, pointerId: 1 });
      handle.dispatchEvent(event);
    };
    pointer("pointerdown", 200);
    pointer("pointermove", 240); // +40px of 400 = +10% of the row
    expect(updates).not.toHaveBeenCalled();
    pointer("pointerup", 240);
    expect(widthsNow()).toEqual([60, 40]);
    expect(updates).toHaveBeenCalledTimes(1);
  });

  it("adds a third column and folds it back without losing a block", () => {
    make([columns([50, 50])]);
    host.querySelector<HTMLButtonElement>('[data-columns-count="3"]')!.click();
    expect(widthsNow()).toHaveLength(3);
    expect(widthsNow()!.every((w) => Math.abs(w - 33.33) < 0.01)).toBe(true);

    // write into the third column, then go back to two
    const third = json().content![0].content![2];
    expect(third.content).toHaveLength(1);
    expect(third.content?.[0].type).toBe("paragraph");
    editor.commands.focus("end");
    editor.commands.insertContent("kept");
    host.querySelector<HTMLButtonElement>('[data-columns-count="2"]')!.click();
    expect(widthsNow()).toEqual([50, 50]);
    expect(editor.getText()).toContain("kept");
    expect(editor.getText()).toContain("col 2");
  });
});

describe("columns-ops", () => {
  it("shares a row evenly", () => {
    expect(equalWidths(2)).toEqual([50, 50]);
    expect(equalWidths(3)).toEqual([33.33, 33.33, 33.33]);
  });
  it("moves a divider and keeps the pair's total", () => {
    expect(resizeWidths([50, 50], 0, 10)).toEqual([60, 40]);
    expect(resizeWidths([50, 50], 0, 1000)).toEqual([85, 15]);
    expect(resizeWidths([50, 50], 0, -1000)).toEqual([15, 85]);
    expect(resizeWidths([20, 30, 50], 1, 5)).toEqual([20, 35, 45]);
  });
  it("ignores a divider that does not exist", () => {
    expect(resizeWidths([50, 50], 1, 10)).toEqual([50, 50]);
    expect(resizeWidths([50, 50], -1, 10)).toEqual([50, 50]);
  });
});
