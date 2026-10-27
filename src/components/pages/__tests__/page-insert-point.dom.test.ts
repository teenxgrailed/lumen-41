/**
 * @jest-environment jsdom
 *
 * Where a block picked from outside the text (the Insert tab, a drop) lands:
 * over the empty paragraph the caret is in, otherwise in a new paragraph after
 * the block the caret is in, or at the boundary a drop names. And how far the
 * page scrolls to show it: the least that does, never to the end.
 */
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import {
  boundaryPos,
  openBlockAt,
  scrollDelta,
} from "@/components/pages/page-editor-logic";

const p = (text?: string) => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

function make(content: JSONContent[]) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return new Editor({
    element: el,
    extensions: [StarterKit],
    content: { type: "doc", content },
  });
}
const kinds = (e: Editor) =>
  e.state.doc.content.content.map(
    (n) => `${n.type.name}:${n.textContent || "-"}`
  );

describe("openBlockAt", () => {
  it("reuses the empty paragraph the caret is in", () => {
    const e = make([p("one"), p()]);
    openBlockAt(e, e.state.doc.content.size - 1);
    expect(kinds(e)).toEqual(["paragraph:one", "paragraph:-"]);
    expect(e.state.selection.$from.parent.content.size).toBe(0);
    e.destroy();
  });

  it("opens a paragraph after the block the caret is in", () => {
    const e = make([p("one"), p("two")]);
    openBlockAt(e, 2);
    expect(kinds(e)).toEqual(["paragraph:one", "paragraph:-", "paragraph:two"]);
    expect(e.state.selection.from).toBe(boundaryPos(e.state.doc, 1) + 1);
    e.destroy();
  });

  it("opens one at a boundary a drop names", () => {
    const e = make([p("one"), p("two")]);
    openBlockAt(e, boundaryPos(e.state.doc, 2));
    expect(kinds(e)).toEqual(["paragraph:one", "paragraph:two", "paragraph:-"]);
    openBlockAt(e, boundaryPos(e.state.doc, 0));
    expect(kinds(e)[0]).toBe("paragraph:-");
    expect(e.state.selection.from).toBe(1);
    e.destroy();
  });

  it("does not stack empty paragraphs next to a boundary", () => {
    const e = make([p("one"), p(), p("two")]);
    openBlockAt(e, boundaryPos(e.state.doc, 1));
    expect(kinds(e)).toEqual(["paragraph:one", "paragraph:-", "paragraph:two"]);
    e.destroy();
  });
});

describe("boundaryPos", () => {
  it("counts whole blocks and clamps", () => {
    const e = make([p("ab"), p("c")]);
    expect(boundaryPos(e.state.doc, 0)).toBe(0);
    expect(boundaryPos(e.state.doc, 1)).toBe(4);
    expect(boundaryPos(e.state.doc, 9)).toBe(e.state.doc.content.size);
    e.destroy();
  });
});

describe("scrollDelta", () => {
  const box = { top: 100, bottom: 700 };
  it("is zero while the line is on screen", () => {
    expect(scrollDelta({ top: 300, bottom: 324 }, box, 24)).toBe(0);
  });
  it("scrolls only the shortfall below", () => {
    expect(scrollDelta({ top: 690, bottom: 714 }, box, 24)).toBe(38);
  });
  it("scrolls only the shortfall above", () => {
    expect(scrollDelta({ top: 110, bottom: 134 }, box, 24)).toBe(-14);
  });
  it("shows the top of a line taller than the box", () => {
    expect(scrollDelta({ top: 650, bottom: 1650 }, box, 24)).toBe(526);
  });
});
