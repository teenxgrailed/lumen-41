/**
 * Settings (desktop sheet) overrides, pinned in the CSS text. The accent
 * swatches in Appearance each carry a `data-accent`; the prototype's bare
 * `[data-accent="x"]` rules let them wear their own colour, and the vendored
 * (rescoped) light side lost the descendant form. The override puts it back,
 * with the vendored light values, and loads after the vendored sheets.
 */
import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";

const mine = postcss.parse(
  readFileSync("src/styles/v3-overrides/settings-desktop.css", "utf8")
);
const themes = postcss.parse(readFileSync("src/styles/v3/themes.css", "utf8"));

const ACCENTS = [
  "blue",
  "pink",
  "mint",
  "violet",
  "amber",
  "graphite",
  "aurora",
  "sunset",
  "lagoon",
];

/** `--accent` declared by the rule(s) whose selector list contains `selector` exactly. */
function accentOf(root: postcss.Root, selector: string) {
  const out: string[] = [];
  root.walkRules((rule: Rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls("--accent", (d) => {
      out.push(d.value);
    });
  });
  return out;
}

describe("Settings desktop overrides", () => {
  it("the vendored sheet has no light descendant rule for an accent (so the override is needed)", () => {
    for (const id of ACCENTS)
      expect(accentOf(themes, `.needt-v3 [data-accent="${id}"]`)).toEqual([]);
  });

  it("every accent has a light descendant rule with the vendored light colour", () => {
    for (const id of ACCENTS) {
      const vendored = accentOf(themes, `.needt-v3[data-accent="${id}"]`);
      expect(vendored.length).toBeGreaterThan(0);
      expect(accentOf(mine, `.needt-v3 [data-accent="${id}"]`)).toEqual([
        vendored[0],
      ]);
    }
  });

  it("the gradient accents carry their fill, not just a solid", () => {
    for (const id of ["aurora", "sunset", "lagoon"]) {
      let gradient = "";
      mine.walkRules((rule: Rule) => {
        if (!rule.selectors.includes(`.needt-v3 [data-accent="${id}"]`)) return;
        rule.walkDecls("--accent-gradient", (d) => {
          gradient = d.value;
        });
      });
      expect(gradient).toMatch(/gradient/);
    }
  });

  it("loads after the vendored sheets (v3-entry.css)", () => {
    const imports = [
      ...readFileSync("src/styles/v3-entry.css", "utf8").matchAll(
        /@import "([^"]+)"/g
      ),
    ].map((m) => m[1]);
    const at = imports.indexOf("./v3-overrides/settings-desktop.css");
    expect(at).toBeGreaterThan(imports.indexOf("./v3/index.css"));
    expect(imports.indexOf("./v3/index.css")).toBeGreaterThanOrEqual(0);
  });
});
