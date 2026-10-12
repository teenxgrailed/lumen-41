/**
 * @jest-environment jsdom
 *
 * The document rail's Contents and Find, read off the page the editor draws:
 * the title first, the headings ranked by the depths the page really uses,
 * empty headings left out, and a match counted wherever the text holds it.
 */
import {
  EDITOR_SELECTOR,
  findRanges,
  occurrences,
  outlineOf,
  scrollToOutline,
} from "../outline";

function page(html: string) {
  document.body.innerHTML = `<article data-doc-sheet><div class="needt-page-editor">${html}</div></article>`;
  return document.querySelector(EDITOR_SELECTOR) as HTMLElement;
}

describe("outlineOf", () => {
  it("is the title, then the headings in order", () => {
    const ed = page("<h2>Scope</h2><p>x</p><h2>Open questions</h2>");
    expect(outlineOf(ed, "Launch brief")).toEqual([
      { text: "Launch brief", level: 0 },
      { text: "Scope", level: 1 },
      { text: "Open questions", level: 1 },
    ]);
  });

  it("ranks by the depths the page uses, not by the tag", () => {
    const ed = page("<h2>A</h2><h3>B</h3><h2>C</h2>");
    expect(outlineOf(ed, "T").map((r) => r.level)).toEqual([0, 1, 2, 1]);
    const all = page("<h1>A</h1><h2>B</h2><h3>C</h3>");
    expect(outlineOf(all, "T").map((r) => r.level)).toEqual([0, 1, 2, 3]);
  });

  it("leaves empty headings out and names an untitled page", () => {
    const ed = page("<h2>  </h2><h2>Real</h2>");
    expect(outlineOf(ed, "")).toEqual([
      { text: "Untitled", level: 0 },
      { text: "Real", level: 1 },
    ]);
  });

  it("is just the title with no editor", () => {
    expect(outlineOf(null, "T")).toEqual([{ text: "T", level: 0 }]);
  });
});

describe("scrollToOutline", () => {
  it("row 0 scrolls the page to the top, a row n scrolls to the n-th real heading", () => {
    const ed = page("<h2></h2><h2>First</h2><h2>Second</h2>");
    const heads = ed.querySelectorAll("h2");
    const into = jest.fn();
    heads.forEach((el) => {
      el.scrollIntoView = () => into(el.textContent);
    });
    const scroller = document.createElement("div");
    const to = jest.fn();
    scroller.scrollTo = to as unknown as typeof scroller.scrollTo;
    scrollToOutline(scroller, ed, 0);
    expect(to).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    scrollToOutline(scroller, ed, 2);
    expect(into).toHaveBeenCalledWith("Second");
    scrollToOutline(scroller, ed, 1);
    expect(into).toHaveBeenLastCalledWith("First");
  });
});

describe("findRanges", () => {
  it("counts every occurrence, ignoring case unless asked", () => {
    const ed = page("<p>The plan, the Plan and THE end</p><p>the</p>");
    expect(findRanges(ed, "the", false)).toHaveLength(4);
    expect(findRanges(ed, "the", true)).toHaveLength(2);
    expect(findRanges(ed, "Plan", true)).toHaveLength(1);
  });

  it("returns the matched words, in reading order", () => {
    const ed = page("<p>one two</p><p>two</p>");
    const r = findRanges(ed, "two", false);
    expect(r.map((x) => x.toString())).toEqual(["two", "two"]);
    expect(r[0].startOffset).toBe(4);
  });

  it("finds nothing for an empty query or no root", () => {
    const ed = page("<p>text</p>");
    expect(findRanges(ed, "", false)).toEqual([]);
    expect(findRanges(null, "text", false)).toEqual([]);
    expect(findRanges(ed, "absent", false)).toEqual([]);
  });
});

describe("Find on text whose lower-case form is longer", () => {
  // "İ" (U+0130) lower-cases to two code units, so offsets taken from the
  // lower-cased string point past the real text and Range.setStart throws.
  it("keeps the offsets of the original text and does not throw", () => {
    const text = "İstanbul and Istanbul";
    expect(text.toLowerCase().length).not.toBe(text.length);
    expect(occurrences(text, "and", false)).toEqual([9]);
    const ed = page("<p>İİİ and more and</p>");
    const found = findRanges(ed, "and", false);
    expect(found.map((r) => r.toString())).toEqual(["and", "and"]);
    expect(found[0].startOffset).toBe(4);
  });

  it("matches the same words when the length does not change", () => {
    expect(occurrences("The the THE", "the", false)).toEqual([0, 4, 8]);
    expect(occurrences("The the THE", "the", true)).toEqual([4]);
    expect(occurrences("abc", "", false)).toEqual([]);
  });
});
