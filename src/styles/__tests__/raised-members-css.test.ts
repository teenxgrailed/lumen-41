/**
 * The raised material's members, pinned in the CSS text. raised.css holds the
 * tokens; raised-members.css lists who wears them and must stay a list: no
 * shadow of its own, no geometry, no filter, no accent fill.
 */
import { readFileSync } from "node:fs";
import postcss, { type Declaration } from "postcss";

const MEMBERS = readFileSync(
  "src/styles/v3-overrides/raised-members.css",
  "utf8"
);
const TOKENS = readFileSync("src/styles/v3-overrides/raised.css", "utf8");
const entry = readFileSync("src/styles/v3-entry.css", "utf8");
const members = postcss.parse(MEMBERS);
const tokens = postcss.parse(TOKENS);

function declarations(): Declaration[] {
  const out: Declaration[] = [];
  members.walkDecls((d) => {
    out.push(d);
  });
  return out;
}

describe("raised-members.css", () => {
  it("loads last, so a member rule outranks the sheets before it", () => {
    const imports = entry
      .split("\n")
      .filter((l) => l.startsWith("@import"))
      .map((l) => l.trim());
    expect(imports[imports.length - 1]).toContain("raised-members.css");
    expect(entry.indexOf("raised.css")).toBeLessThan(
      entry.indexOf("raised-members.css")
    );
  });

  it("draws every shadow from the shared tokens, never a value of its own", () => {
    const shadows = declarations().filter((d) => d.prop === "box-shadow");
    expect(shadows.length).toBeGreaterThan(10);
    for (const d of shadows) {
      expect(d.value).toMatch(/var\(--v3-raised-[a-z-]+\)/);
      // a state ring may come first, composed with the disc
      expect(d.value).not.toMatch(/rgba?\(/);
    }
  });

  it("changes the material only: no geometry, transform, filter or accent fill", () => {
    const banned = [
      "width",
      "height",
      "min-width",
      "min-height",
      "padding",
      "margin",
      "border-radius",
      "font",
      "font-size",
      "transform",
      "translate",
      "scale",
      "filter",
    ];
    for (const d of declarations()) {
      expect(banned).not.toContain(d.prop);
      if (d.prop === "backdrop-filter" || d.prop === "-webkit-backdrop-filter")
        expect(d.value).toBe("none");
      expect(d.value).not.toMatch(/--accent|--fill-accent|--v2p-lav(?![-\w])/);
    }
  });

  it("only uses tokens that raised.css defines for light and dark", () => {
    const used = new Set(MEMBERS.match(/--v3-raised-[a-z-]+/g));
    const defined = (selector: RegExp) => {
      const names = new Set<string>();
      tokens.walkRules((rule) => {
        if (!selector.test(rule.selector)) return;
        rule.walkDecls((d) => {
          if (d.prop.startsWith("--v3-raised-")) names.add(d.prop);
        });
      });
      return names;
    };
    const light = defined(/^\.needt-v3$/);
    const dark = defined(/data-theme="dark"/);
    expect(used.size).toBeGreaterThan(5);
    for (const name of used) {
      expect(light).toContain(name);
      expect(dark).toContain(name);
    }
  });
});
