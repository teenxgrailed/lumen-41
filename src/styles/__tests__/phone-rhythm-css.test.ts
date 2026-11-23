import fs from "node:fs";
import path from "node:path";

const read = (f: string) =>
  fs.readFileSync(path.join(__dirname, "../v3-overrides", f), "utf8");
const day = read("day-plan.css");
const home = read("ha-home.css");
const rhythm = read("phone-rhythm.css");
const entry = fs.readFileSync(path.join(__dirname, "../v3-entry.css"), "utf8");

/** The CSS without its comments, so a rule mentioned in prose does not count. */
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("phone Today vertical rhythm", () => {
  it("is loaded by the v3 entry", () => {
    expect(entry).toContain('"./v3-overrides/phone-rhythm.css"');
  });

  it("has exactly three spacing values: section, group, row", () => {
    expect(day).toMatch(/--ph-sec:\s*24px/);
    expect(day).toMatch(/--ph-grp:\s*16px/);
    expect(day).toMatch(/--ph-row:\s*8px/);
  });

  it("spaces the list's blocks once, on the container, not as a sum of margins", () => {
    const d = code(day);
    // the day's own 22 px flex gap is cancelled, the owl rule spaces the blocks
    expect(d).toMatch(/\.v2p-day\.dp-list \{[^}]*gap: 0/);
    expect(d).toMatch(
      /\.dp-list > \* \+ \*[^{]*\{\s*margin-top: var\(--ph-grp\)/
    );
    // no stacked group margin, no 16/28 px label and list margins any more
    expect(d).not.toContain(".dp-group + .dp-group");
    expect(d).not.toMatch(/\.dp-list \{[^}]*margin-top: 28px/);
    expect(d).not.toMatch(/\.dp-label \{[^}]*margin: 16px/);
    // the last row of a block adds no margin of its own to the gap
    expect(d).toMatch(/\.dp-list \.pk-rw:last-child \{\s*margin-bottom: 0/);
  });

  it("parts the stack of cards below the list by one section", () => {
    expect(code(home)).toMatch(
      /\.dp-list ~ \.ha-ph-stack \{ margin-top: var\(--ph-sec\)/
    );
  });

  it("a part of the day is a plain 13 px label with no count", () => {
    expect(code(day)).toMatch(/\.dp-label \{[^}]*font: 500 13px\/16px[^}]*\}/);
    expect(code(day)).not.toMatch(/\.dp-label[^{]*\{[^}]*uppercase/);
  });
});

describe("phone rhythm fixes", () => {
  const r = code(rhythm);

  it("the easy start sub line and Tasks titles take two lines", () => {
    expect(r).toMatch(/\.esr-sub-text \{[^}]*-webkit-line-clamp: 2/);
    expect(r).toMatch(
      /\[data-pk-screen="tasks"\] \.pk-row-title \{[^}]*-webkit-line-clamp: 2/
    );
  });

  it("the Tasks tabs and the Move to today chip hit 44 px, drawn size unchanged", () => {
    expect(r).toMatch(/\.ptk-seg-btn::before[\s\S]*?height: 44px/);
    expect(r).not.toMatch(/\.ptk-seg-btn \{[^}]*height/);
  });

  it("the Plan tile line gives the width to the title and may take two lines", () => {
    expect(r).toMatch(
      /\[data-tile="today"\] \.ntm-txt \{[^}]*-webkit-line-clamp: 2/
    );
    expect(r).toMatch(
      /\[data-tile="today"\] \.ntm-chip-row \{[^}]*height: auto/
    );
  });
});
