/**
 * Phone text can be selected and copied (phone-kit.css turns selection off for
 * the whole scroller, which is right for controls and wrong for words), and the
 * composer's title scrolls past its cap.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "src/styles", f), "utf8");
const css = read("v3-overrides/phone-text.css");

describe("phone text selection", () => {
  it("the override is loaded", () => {
    expect(read("v3-entry.css")).toContain("v3-overrides/phone-text.css");
  });

  it("titles, notes and errors get text selection back", () => {
    const start = css.indexOf(".needt-v3 .pk-title");
    const body = css.slice(start, css.indexOf("}", start));
    for (const c of [
      ".pk-title",
      ".pk-empty-line",
      ".ptk-edit-err",
      ".phb-item-note",
    ])
      expect(body).toContain(c);
    expect(body).toContain("user-select: text");
    expect(body).toContain("-webkit-user-select: text");
  });

  it("a row's title and meta are not listed: a long press there is PkHold's", () => {
    const start = css.indexOf(".needt-v3 .pk-title");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).not.toContain(".pk-row-title");
    expect(body).not.toContain(".pk-row-meta");
  });

  it("a guard after the block keeps none for holds and drag zones", () => {
    const guard = css.indexOf(".needt-v3 .pk-hold,");
    expect(guard).toBeGreaterThan(css.indexOf(".needt-v3 .pk-title"));
    const body = css.slice(guard, css.indexOf("}", guard));
    for (const c of [".pk-hold", "[data-pd-zone]", ".needt-v3.is-pd-drag *"])
      expect(body).toContain(c);
    // fields stay editable, and the drag selector is not listed twice
    expect(body).toContain("*:not(input, textarea, [contenteditable])");
    expect(body).not.toContain(".needt-v3 .is-pd-drag");
    expect(body).toContain("user-select: none");
  });

  it("controls keep none: no button, tab bar or check is listed", () => {
    const start = css.indexOf(".needt-v3 .pk-title");
    const body = css.slice(start, css.indexOf("}", start));
    for (const c of ["button", "pk-check", "pk-act", "pk-tab", "pk-reveal"])
      expect(body).not.toContain(c);
    expect(read("v3/phone-kit.css")).toMatch(
      /\.pk-scroll \{ user-select: none/
    );
  });
});

describe("composer title scroll", () => {
  it("the textarea scrolls and hides its scrollbar so it wraps like the mirror", () => {
    const start = css.indexOf(".needt-v3 .pov-line .pov-big {");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("scrollbar-width: none");
    expect(css).toContain(".pov-big::-webkit-scrollbar");
  });
});
