/**
 * Calendar keeps the chrome scale (13/12, no 14px) and draws hour lines with a
 * ladder fill, not a dimmed border (PORT.md rules 1 and 2).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3/calendar.css"),
  "utf8"
);
const root = postcss.parse(css);

describe("calendar.css", () => {
  it("uses no 14px type", () => {
    root.walkDecls((d) => {
      if (d.prop === "font" || d.prop === "font-size")
        expect(
          `${d.parent && "selector" in d.parent ? d.parent.selector : ""} ${d.value}`
        ).not.toMatch(/(^|\s)14px/);
    });
  });

  it("draws hour lines with --fill-4 at full opacity", () => {
    root.walkRules(".needt-v3 .c2-hline", (rule) => {
      const decls: Record<string, string> = {};
      rule.walkDecls((d) => {
        decls[d.prop] = d.value;
      });
      expect(decls.background).toBe("var(--fill-4)");
      expect(decls.opacity).toBeUndefined();
    });
  });
});
