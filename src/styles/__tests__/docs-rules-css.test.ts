/**
 * Docs follows the design system: a checked task box is accent at 24% with an
 * accent tick, never a solid accent fill (PORT.md rule 3), and miniature
 * greys sit on the text ladder (rule 1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

function decls(file: string, match: (selector: string) => boolean) {
  const out: Record<string, string> = {};
  postcss
    .parse(readFileSync(join(process.cwd(), file), "utf8"))
    .walkRules((rule) => {
      if (!match(rule.selector.replace(/\s+/g, " "))) return;
      rule.walkDecls((d) => {
        out[d.prop] = d.value;
      });
    });
  return out;
}

const OPENED = "src/styles/v3-overrides/doc-opened.css";

describe("docs task list checkbox", () => {
  it("is accent at 24% when checked", () => {
    const box = decls(OPENED, (s) =>
      s.endsWith('ul[data-type="taskList"] input[type="checkbox"]:checked')
    );
    expect(box.background).toBe("var(--fill-accent-strong)");
  });

  it("draws the tick in the accent", () => {
    const tick = decls(OPENED, (s) =>
      s.endsWith(
        'ul[data-type="taskList"] input[type="checkbox"]:checked::after'
      )
    );
    expect(tick.background).toBe("var(--accent)");
  });
});

describe("docs miniature", () => {
  it("draws page lines at a ladder step", () => {
    const line = decls(
      "src/styles/v3/docs.css",
      (s) => s === ".needt-v3 .docs-dc-mini-page-4"
    );
    expect(line.background).toBe("var(--text-disabled)");
    expect(line.opacity).toBeUndefined();
  });
});
