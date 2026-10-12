/**
 * Rule 12 for phone Settings, pinned in the CSS text: inside the Settings and
 * picker sheets the controls transition only `transform` (a colour, background
 * or shadow transition repaints every frame), and reduced motion switches the
 * transforms off too. The file is parsed with postcss; the vendored sheet is
 * read as well, to prove each control really is overridden.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";

const read = (p: string) =>
  readFileSync(join(process.cwd(), "src/styles", p), "utf8");

const mine = postcss.parse(read("v3-overrides/settings-phone.css"));
const vendored = postcss.parse(read("v3/phone-settings.css"));

/** The `transition` value of every top-level rule whose selector mentions `cls`. */
function transitions(root: postcss.Root, cls: string, inMedia = false) {
  const out: { selector: string; value: string }[] = [];
  root.walkRules((rule: Rule) => {
    const media =
      rule.parent?.type === "atrule" &&
      (rule.parent as AtRule).name === "media";
    if (media !== inMedia) return;
    if (!rule.selector.includes(cls)) return;
    rule.walkDecls(/^transition(-property)?$/, (d) => {
      out.push({ selector: rule.selector, value: d.value });
    });
  });
  return out;
}

/** The properties a `transition` value animates; commas inside var() are not separators. */
function animated(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((prop) => prop && prop !== "none");
}

const CONTROLS = [
  ".ps-row.is-open",
  ".ps-switch",
  ".ps-switch-knob",
  ".ps-seg-btn",
  ".ps-theme-pic",
  ".ps-accent",
];

describe("phone Settings, rule 12", () => {
  it("the vendored sheet does ease colour and shadow on these controls (so the override is needed)", () => {
    const eased = CONTROLS.filter((c) =>
      transitions(vendored, c).some((t) =>
        animated(t.value).some((p) => p !== "transform")
      )
    );
    expect(eased.sort()).toEqual([...CONTROLS].sort());
  });

  it("the sheets override each control to transform only", () => {
    for (const control of CONTROLS) {
      const scoped = transitions(mine, control).filter(
        (t) =>
          t.selector.includes(".ps11-sheet") &&
          t.selector.includes(".ps-pick-sheet")
      );
      expect(scoped.length).toBeGreaterThan(0);
      for (const t of scoped)
        for (const prop of animated(t.value)) expect(prop).toBe("transform");
    }
  });

  it("no rule in the file transitions anything but transform", () => {
    mine.walkDecls(/^transition(-property)?$/, (d) => {
      for (const prop of animated(d.value)) expect(prop).toBe("transform");
    });
  });

  it("reduced motion turns the transforms off", () => {
    for (const control of [".ps-switch-knob", ".ps-theme-pic", ".ps-accent"]) {
      const off = transitions(mine, control, true);
      expect(off.length).toBeGreaterThan(0);
      for (const t of off) expect(t.value).toBe("none");
    }
  });
});
