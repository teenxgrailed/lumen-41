/**
 * @jest-environment jsdom
 *
 * Info → Numbers are read from the editor's own text.
 */
import { statsOf } from "../outline";

describe("statsOf", () => {
  it("counts words, characters without line breaks, and top-level blocks", () => {
    const ed = document.createElement("div");
    ed.innerHTML = "<h2>Scope</h2><p>one two three</p><ul><li>x</li></ul>";
    // jsdom has no layout, so innerText is the text content.
    Object.defineProperty(ed, "innerText", {
      value: "Scope\none two three\nx",
    });
    expect(statsOf(ed)).toEqual({ words: 5, characters: 19, blocks: 3 });
  });

  it("is zero with no editor and for an empty page", () => {
    expect(statsOf(null)).toEqual({ words: 0, characters: 0, blocks: 0 });
    const ed = document.createElement("div");
    expect(statsOf(ed).words).toBe(0);
  });
});
