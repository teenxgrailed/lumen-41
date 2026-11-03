/**
 * Desktop Home keeps the chrome type scale: 13px and 12px, no 14px
 * (PORT.md rule 2). The phone (Plates) density has its own sizes.
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

describe("ha-home.css on desktop", () => {
  it("sets the row type at 13px", () => {
    expect(declsOf(".needt-v3 .ha-desk")["--ha-t-row"]).toMatch(/\s13px\//);
  });

  it.each(["ha-hl-when", "ha-hl-sub", "ha-hl-ask span"])(
    "overrides the phone's 14px on .%s",
    (el) => {
      const font = declsOf(`.needt-v3 .ha-desk .${el}`).font;
      expect(font).toBeDefined();
      expect(font).not.toMatch(/(^|\s)14px/);
    }
  );
});
