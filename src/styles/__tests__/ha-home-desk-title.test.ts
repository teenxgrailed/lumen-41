/**
 * Desktop Home titles use the design system's page title: 600 22px/1.2.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type Rule } from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/ha-home.css"),
  "utf8"
);
const root = postcss.parse(css);

function declsOf(selector: string) {
  const out: Record<string, string> = {};
  root.walkRules((rule: Rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((d) => {
      out[d.prop] = d.value;
    });
  });
  return out;
}

describe("ha-home.css desktop title", () => {
  it("matches --type-page-title (600 22px/1.2)", () => {
    expect(declsOf(".needt-v3 .ha-desk")["--ha-t-title"]).toBe(
      "600 22px/1.2 var(--font-sans)"
    );
  });
});
