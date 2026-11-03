/**
 * Desktop Home greys sit on the text ladder (PORT.md rule 1): a bar drawn in
 * the ink and dimmed with an arbitrary opacity is a grey off the ladder.
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

describe("ha-home.css desktop greys", () => {
  it.each([".ha-track > span", ".ha-tl-bar .plan"])(
    "%s draws a ladder step at full opacity",
    (el) => {
      const d = declsOf(`.needt-v3 .ha-desk ${el}`);
      expect(d.background).toBe("var(--text-secondary)");
      expect(d.opacity).toBe("1");
    }
  );
});
