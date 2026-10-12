/**
 * The P6 block of the hand-written overrides, read the way the browser reads
 * the sheets: `v3-entry.css` loads the vendored phone-tasks.css first and
 * motion.css after it, so an equal-specificity rule in motion.css wins.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const root = join(__dirname, "../../../../../styles");
const read = (f: string) => readFileSync(join(root, f), "utf8");

function decls(css: string, selector: string, prop: string) {
  const out: string[] = [];
  postcss.parse(css).walkRules((r) => {
    if (r.parent?.type !== "root") return;
    if (!r.selectors.includes(selector)) return;
    r.walkDecls(prop, (d) => void out.push(d.value));
  });
  return out;
}

describe("phone Tasks overrides", () => {
  const entry = read("v3-entry.css");
  const motion = read("v3-overrides/motion.css");
  const vendored = read("v3/phone-tasks.css");

  it("the entry loads the vendored sheets before motion.css", () => {
    const at = (s: string) => entry.indexOf(s);
    expect(at('"./v3/index.css"')).toBeGreaterThan(-1);
    expect(at('"./v3/index.css"')).toBeLessThan(
      at('"./v3-overrides/motion.css"')
    );
  });

  it("the vendored entrance fills forwards ...", () => {
    const [anim] = decls(vendored, ".needt-v3 .ptk-swap", "animation");
    expect(anim).toMatch(/\bboth\b/);
  });

  it("... and motion.css gives it back: a finished entrance holds no end state", () => {
    expect(decls(motion, ".needt-v3 .ptk-swap", "animation-fill-mode")).toEqual(
      ["backwards"]
    );
  });

  it("the tap-target type and the ring keep their 13 px / no-ease corrections", () => {
    expect(decls(motion, ".needt-v3 .ptk-seg-btn", "font-size")).toEqual([
      "13px",
    ]);
    expect(decls(motion, ".needt-v3 .ptk-ring-fill", "transition")).toEqual([
      "none",
    ]);
  });
});
