/**
 * @jest-environment jsdom
 *
 * The phone editing bar over a real editor: every button does what its name
 * says, shows when it is on, never takes focus from the page, and the block
 * menu runs the page's own command runner.
 */
import { act, createElement as h } from "react";

import { Editor, type JSONContent } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { TextSelection } from "@tiptap/pm/state";
import { type Root, createRoot } from "react-dom/client";

import { Yjs as Y } from "@/lib/collaboration/yjs";
import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

import { PhoneEditBar } from "../PhoneEditBar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => {
  const icon = () => null;
  return new Proxy(
    { __esModule: true },
    { get: (t, k) => (k in t ? (t as never)[k] : icon) }
  );
});

let editorHost: HTMLElement;
let barHost: HTMLElement;
let root: Root;
let editor: Editor;
const onCommand = jest.fn();
const onLink = jest.fn();
const onInsert = jest.fn();

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const make = (content: JSONContent[]) => {
  editorHost = document.createElement("div");
  document.body.appendChild(editorHost);
  // The page runs with Collaboration, which is also where undo and redo come from.
  editor = new Editor({
    element: editorHost,
    extensions: [
      ...pageEditorExtensions,
      Collaboration.configure({ document: new Y.Doc() }),
    ],
  });
  editor.commands.setContent({ type: "doc", content }, { emitUpdate: false });
  barHost = document.createElement("div");
  document.body.appendChild(barHost);
  root = createRoot(barHost);
  act(() =>
    root.render(h(PhoneEditBar, { editor, onCommand, onLink, onInsert }))
  );
};

beforeEach(() => {
  // jsdom has no layout: ProseMirror asks ranges and elements for rectangles.
  const rects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as never;
  Range.prototype.getClientRects = rects;
  Element.prototype.getClientRects = rects;
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
  onCommand.mockClear();
  onLink.mockClear();
  onInsert.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  editorHost.remove();
  barHost.remove();
});

const btn = (label: string) =>
  barHost.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const press = (el: Element) =>
  act(() => {
    (el as HTMLElement).click();
  });
const selectAll = () => act(() => void editor.commands.selectAll());
/** The caret at the end of the text node that holds `text`. */
const caretAfter = (text: string) =>
  act(() => {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text === text) at = pos + text.length;
      return true;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at))
    );
  });
// The bar reads the editor through useEditorState, which batches a frame.
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

describe("the bar", () => {
  it("is the page's editing actions, scrolls as one strip, and hides the keyboard button at rest", () => {
    make([para("Hello")]);
    const bar = barHost.querySelector<HTMLElement>(
      "[aria-label='Page editing actions']"
    )!;
    expect(bar.hasAttribute("data-assistant-avoid")).toBe(true);
    expect(bar.dataset.kb).toBe("rest");
    expect(
      barHost.querySelector("[role='toolbar'][aria-label='Formatting']")
    ).not.toBeNull();
    expect(btn("Hide keyboard")).not.toBeNull();
  });

  it("never takes focus from the page (mousedown is cancelled)", () => {
    make([para("Hello")]);
    const bar = barHost.querySelector<HTMLElement>(
      "[aria-label='Page editing actions']"
    )!;
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    bar.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("holds the whole set, in a stable order", () => {
    make([para("Hello")]);
    const names = Array.from(
      barHost.querySelectorAll<HTMLButtonElement>("[role='toolbar'] button")
    ).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Block type",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Link",
      "Colour and highlight",
      "Outdent",
      "Indent",
      "Undo",
      "Redo",
      "Insert block or attachment",
    ]);
  });
});

describe("formatting", () => {
  it("bold, italic, underline and strike act on the selection and show when on", () => {
    make([para("Hello")]);
    selectAll();
    for (const [label, mark] of [
      ["Bold", "bold"],
      ["Italic", "italic"],
      ["Underline", "underline"],
      ["Strikethrough", "strike"],
    ] as const) {
      expect(btn(label).getAttribute("aria-pressed")).toBe("false");
      press(btn(label));
      expect(editor.isActive(mark)).toBe(true);
      expect(btn(label).getAttribute("aria-pressed")).toBe("true");
    }
    press(btn("Bold"));
    expect(editor.isActive("bold")).toBe(false);
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("false");
  });

  it("Link and Insert hand over to the page", () => {
    make([para("Hello")]);
    press(btn("Link"));
    press(btn("Insert block or attachment"));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it("colour opens the swatch rows for the text colour and the highlight", () => {
    make([para("Hello")]);
    selectAll();
    press(btn("Colour and highlight"));
    const panel = barHost.querySelector("[data-panel='color']")!;
    expect(panel.querySelector("[aria-label='Text colour']")).not.toBeNull();
    expect(panel.querySelector("[aria-label='Highlight']")).not.toBeNull();
    // A second press puts it away.
    press(btn("Colour and highlight"));
    expect(barHost.querySelector("[data-panel]")).toBeNull();
  });
});

describe("block type", () => {
  it("names the block the caret is in and lists the types", async () => {
    make([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "H" }],
      },
      para("body"),
    ]);
    caretAfter("H");
    await settle();
    expect(btn("Block type").textContent).toContain("Heading 2");
    press(btn("Block type"));
    const menu = barHost.querySelector(
      "[role='menu'][aria-label='Block type']"
    )!;
    const items = Array.from(menu.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(items).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bulleted list",
      "Numbered list",
      "Task",
      "Checklist",
      "Toggle",
      "Callout",
      "Quote",
      "Code",
      "Divider",
      "Image",
      "Table",
    ]);
    expect(
      menu.querySelector("[aria-checked='true']")?.getAttribute("data-block")
    ).toBe("heading2");
  });

  it("choosing a type runs the page's command and closes the menu", () => {
    make([para("body")]);
    press(btn("Block type"));
    press(barHost.querySelector("[data-block='taskItem']")!);
    expect(onCommand).toHaveBeenCalledWith("taskItem");
    expect(barHost.querySelector("[role='menu']")).toBeNull();
  });

  it("a tap outside the bar closes the menu", () => {
    make([para("body")]);
    press(btn("Block type"));
    expect(barHost.querySelector("[role='menu']")).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(barHost.querySelector("[role='menu']")).toBeNull();
  });
});

describe("indent, undo and the keyboard", () => {
  const list = (): JSONContent => ({
    type: "bulletList",
    content: [
      { type: "listItem", content: [para("one")] },
      { type: "listItem", content: [para("two")] },
    ],
  });

  it("indent and outdent are off outside a list, and move the item inside one", async () => {
    make([para("plain"), list()]);
    caretAfter("plain");
    await settle();
    expect(btn("Indent").disabled).toBe(true);
    expect(btn("Outdent").disabled).toBe(true);

    // Second item: it can sink under the first.
    caretAfter("two");
    await settle();
    expect(btn("Indent").disabled).toBe(false);
    press(btn("Indent"));
    await settle();
    const depth = (editor.getJSON().content ?? [])[1]
      .content![0] as JSONContent;
    expect(JSON.stringify(depth)).toContain("two");
    expect(btn("Outdent").disabled).toBe(false);
    press(btn("Outdent"));
    expect((editor.getJSON().content ?? [])[1].content).toHaveLength(2);
  });

  it("undo and redo follow the history", () => {
    make([para("Hello")]);
    selectAll();
    press(btn("Bold"));
    expect(editor.isActive("bold")).toBe(true);
    expect(btn("Undo").disabled).toBe(false);
    press(btn("Undo"));
    expect(editor.isActive("bold")).toBe(false);
    expect(btn("Redo").disabled).toBe(false);
    press(btn("Redo"));
    expect(editor.isActive("bold")).toBe(true);
  });

  it("Hide keyboard blurs the page", async () => {
    make([para("Hello")]);
    const blur = jest.spyOn(editor.view.dom, "blur");
    press(btn("Hide keyboard"));
    // The blur command waits a frame.
    await settle();
    expect(blur).toHaveBeenCalledTimes(1);
  });
});
