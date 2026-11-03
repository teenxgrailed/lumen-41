/**
 * Desktop Settings keeps the chrome scale: 13px and 12px, no 14px (PORT.md
 * rule 2). The avatar's initials are a glyph sized to its 40px circle.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3/settings.css"),
  "utf8"
);

describe("settings.css", () => {
  it("uses no 14px chrome type", () => {
    const hits: string[] = [];
    postcss.parse(css).walkDecls((d) => {
      const selector = (d.parent as { selector?: string }).selector ?? "";
      if (selector.includes("settings-me-avatar")) return;
      if (
        (d.prop === "font" || d.prop === "font-size") &&
        /(^|\s)14px/.test(d.value)
      ) {
        hits.push(`${selector}: ${d.value}`);
      }
    });
    expect(hits).toEqual([]);
  });
});
