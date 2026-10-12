import { readFileSync } from "fs";
import { join } from "path";
import postcss from "postcss";

/**
 * A row's title must take the width that is left. Layout needs a browser, so
 * this pins the contract in the P5 block of motion.css: the row wrap's one
 * column is shrinkable (`minmax(0, 1fr)`) and every link down to the title has
 * `min-width: 0`.
 */
const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/motion.css"),
  "utf8"
);
const block = css.slice(css.indexOf("P5 · phone Home + Calendar"));
const rules = new Map<string, Map<string, string>>();
postcss.parse(block).walkRules((r) => {
  r.selectors.forEach((sel) => {
    const m = rules.get(sel) ?? new Map<string, string>();
    r.walkDecls((d) => {
      m.set(d.prop, d.value);
    });
    rules.set(sel, m);
  });
});
const decl = (sel: string, prop: string) =>
  rules.get(`.needt-v3 ${sel}`)?.get(prop);

describe("P5 row widths", () => {
  it("the wrap's column can shrink", () => {
    expect(decl(".pk-rw", "grid-template-columns")).toBe("minmax(0, 1fr)");
  });
  it.each([
    ".pk-rw",
    ".pk-rw-in",
    ".pk-row",
    ".pk-row-open",
    ".pk-row-main",
    ".pk-row-title",
  ])("%s may be narrower than its content", (sel) => {
    expect(decl(sel, "min-width")).toBe("0");
  });
  it("the open button and the text column share what is left", () => {
    expect(decl(".pk-row-open", "flex")).toBe("1 1 0%");
    expect(decl(".pk-row-main", "flex")).toBe("1 1 0%");
  });
});
