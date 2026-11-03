/**
 * Tasks keeps the chrome scale: 13px and 12px, no 14px (PORT.md rule 2).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3/tasks.css"),
  "utf8"
);

describe("tasks.css", () => {
  it("uses no 14px type", () => {
    const hits: string[] = [];
    postcss.parse(css).walkDecls((d) => {
      if (
        (d.prop === "font" || d.prop === "font-size") &&
        /(^|\s)14px/.test(d.value)
      ) {
        hits.push(
          `${(d.parent as { selector?: string }).selector}: ${d.value}`
        );
      }
    });
    expect(hits).toEqual([]);
  });
});
