/**
 * @jest-environment jsdom
 *
 * Highlight, text colour and underline: the marks themselves (commands,
 * Markdown shortcut, HTML round trip, bad stored values) and the swatch row
 * the selection bar and the phone Format sheet draw them with.
 */
import { Editor, type JSONContent } from "@tiptap/core";

import { DOC_TEXTS } from "@/components/needt3/docs/style";
import { inkTone } from "@/components/needt3/docs/style";
import {
  DEFAULT_HIGHLIGHT,
  MARK_COLORS,
  markColor,
} from "@/components/pages/marks";

import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

let host: HTMLElement;
let editor: Editor;

const json = () => editor.getJSON() as JSONContent;
const marksOf = () =>
  (json().content?.[0].content ?? []).map((n) => ({
    text: n.text,
    marks: (n.marks ?? []).map((m) => [m.type, m.attrs?.color]),
  }));

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: pageEditorExtensions,
    content: "<p>colour this word</p>",
  });
  // "this" is characters 8-12
  editor.commands.setTextSelection({ from: 8, to: 12 });
});
afterEach(() => {
  editor.destroy();
  host.remove();
});

describe("the palette", () => {
  it("is the document's hues and nothing else", () => {
    const hues = DOC_TEXTS.filter((t) => t.dk && t.lt).map((t) => t.id);
    expect(MARK_COLORS.map((c) => c.id)).toEqual(hues);
    expect(hues.length).toBeGreaterThanOrEqual(5);
  });

  it("falls back for an unknown colour in stored data", () => {
    expect(markColor("hotpink", "umber")).toBe("umber");
    expect(markColor(42, DEFAULT_HIGHLIGHT)).toBe(DEFAULT_HIGHLIGHT);
    expect(markColor("navy", "umber")).toBe("navy");
  });
});

describe("highlight", () => {
  it("marks only the selected words, in the chosen hue", () => {
    editor.commands.setHighlight("wine");
    expect(marksOf()).toEqual([
      { text: "colour ", marks: [] },
      { text: "this", marks: [["highlight", "wine"]] },
      { text: " word", marks: [] },
    ]);
  });

  it("changing the hue replaces it; unsetting removes it", () => {
    editor.commands.setHighlight("wine");
    editor.commands.setHighlight("navy");
    expect(marksOf()[1].marks).toEqual([["highlight", "navy"]]);
    editor.commands.unsetHighlight();
    expect(marksOf()).toHaveLength(1);
  });

  it("toggles on and off with the default hue", () => {
    editor.commands.toggleHighlight();
    expect(editor.isActive("highlight")).toBe(true);
    expect(marksOf()[1].marks).toEqual([["highlight", DEFAULT_HIGHLIGHT]]);
    editor.commands.toggleHighlight();
    expect(editor.isActive("highlight")).toBe(false);
  });

  it("draws <mark data-hl> and reads it back", () => {
    editor.commands.setHighlight("plum");
    expect(editor.getHTML()).toContain('<mark data-hl="plum">this</mark>');
    editor.commands.setContent('<p>a <mark data-hl="forest">b</mark></p>');
    expect(marksOf()[1].marks).toEqual([["highlight", "forest"]]);
  });

  it("reads a plain <mark> and a bad hue as the default", () => {
    editor.commands.setContent(
      '<p><mark>a</mark><mark data-hl="nope">b</mark></p>'
    );
    // Both read as the same mark, so they are one run of text.
    expect(marksOf()).toEqual([
      { text: "ab", marks: [["highlight", DEFAULT_HIGHLIGHT]] },
    ]);
  });

  it("==text== typed becomes a highlight", () => {
    editor.commands.setContent("<p></p>");
    editor.commands.focus("start");
    editor.commands.insertContent("see ==this=");
    // The input rule fires on typing, so type the closing character.
    editor.view.someProp("handleTextInput", (f) =>
      f(
        editor.view,
        editor.state.selection.from,
        editor.state.selection.to,
        "=",
        () => editor.state.tr
      )
    );
    expect(JSON.stringify(json())).toContain('"highlight"');
  });
});

describe("text colour", () => {
  it("sets, changes and clears the colour of the selection", () => {
    editor.commands.setTextColor("forest");
    expect(marksOf()[1].marks).toEqual([["textColor", "forest"]]);
    expect(editor.getHTML()).toContain('<span data-tc="forest">this</span>');
    editor.commands.setTextColor("navy");
    expect(marksOf()[1].marks).toEqual([["textColor", "navy"]]);
    editor.commands.unsetTextColor();
    expect(marksOf()).toHaveLength(1);
  });

  it("sits next to bold and a highlight", () => {
    editor.commands.setTextColor("wine");
    editor.commands.toggleBold();
    editor.commands.setHighlight("umber");
    const kinds = marksOf()[1].marks.map((m) => m[0]);
    expect(kinds).toEqual(
      expect.arrayContaining(["textColor", "bold", "highlight"])
    );
  });
});

describe("underline", () => {
  it("toggles on the selection", () => {
    editor.commands.toggleUnderline();
    expect(marksOf()[1].marks).toEqual([["underline", undefined]]);
    editor.commands.toggleUnderline();
    expect(marksOf()).toHaveLength(1);
  });
});

describe("inkTone", () => {
  it("is pale on a dark page and deep on a light one", () => {
    expect(inkTone("#f2f1ee")).toBe("lt");
    expect(inkTone("#1c1d20")).toBe("dk");
    expect(inkTone(undefined)).toBe("dk");
    expect(inkTone("not a colour")).toBe("dk");
  });
});
