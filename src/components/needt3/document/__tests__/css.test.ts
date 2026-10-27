/**
 * The opened Document's override sheet, read the way the browser reads it:
 * loaded last by the entry, every rule scoped to the v3 frame, the prototype's
 * measures on the sheet's title and body, and no value of its own (no custom
 * property, no 14px chrome type, no colour literal outside an image).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const root = join(__dirname, "../../../../styles");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const css = read("v3-overrides/doc-opened.css");
const parsed = postcss.parse(css);

function decls(selector: string, prop: string) {
  const out: string[] = [];
  parsed.walkRules((r) => {
    if (r.parent?.type !== "root" || !r.selectors.includes(selector)) return;
    r.walkDecls(prop, (d) => void out.push(d.value));
  });
  return out;
}

describe("doc-opened.css", () => {
  it("is imported by the entry, after the vendored sheets", () => {
    const entry = read("v3-entry.css");
    expect(entry.indexOf('"./v3/index.css"')).toBeGreaterThan(-1);
    expect(entry.indexOf("doc-opened.css")).toBeGreaterThan(
      entry.indexOf('"./v3/index.css"')
    );
  });

  it("scopes every rule to the v3 frame", () => {
    parsed.walkRules((r) => {
      for (const s of r.selectors)
        expect(s.replace(/\s+/g, " ")).toMatch(/^\.needt-v3/);
    });
  });

  it("gives the title and the body the prototype's measures", () => {
    expect(
      decls(".needt-v3 [data-doc-sheet] [data-page-title]", "font")
    ).toEqual(["700 32px/40px var(--font-sans)"]);
    expect(
      decls(".needt-v3 [data-doc-sheet] .needt-page-editor", "font")[0]
    ).toMatch(/16px/);
    expect(
      decls(".needt-v3 [data-doc-sheet] .needt-page-editor h2", "font-size")
    ).toEqual(["20px"]);
  });

  it("hides the editor's toolbar and no other piece of its chrome", () => {
    expect(
      decls(
        '.needt-v3 [data-doc-sheet] [aria-label="Page editor toolbar"]',
        "display"
      )
    ).toEqual(["none"]);
  });

  it("adds no custom property, no 14px type and no colour literal", () => {
    parsed.walkDecls((d) => {
      expect(d.prop.startsWith("--")).toBe(false);
      if (/^font(-size)?$/.test(d.prop))
        expect(d.value).not.toMatch(/(^|[^\d])14px/);
      expect(d.value.replace(/url\([^)]*\)/g, "")).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(/i
      );
    });
  });

  it("keeps the page's scroller from gliding on its own", () => {
    expect(
      decls(".needt-v3 .docs-document-screen-3", "scroll-behavior")
    ).toEqual(["auto"]);
  });

  it("styles the Insert drag with tokens only", () => {
    expect(decls(".needt-v3 .docs-insert-drop-line", "background")).toEqual([
      "var(--accent)",
    ]);
    expect(decls(".needt-v3 .docs-insert-ghost", "pointer-events")).toEqual([
      "none",
    ]);
  });
});
