/**
 * The nested `.dark` / `.paper` theme classes (motion.css, P1) must carry the
 * same --v2p-* / --pk-* values as the frame's own data-theme blocks in the
 * vendored themes.css. The vendored sheet is regenerated from the prototype;
 * this test fails when the hand-written copy has fallen behind.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../styles");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (v: string) => v.replace(/\s+/g, " ").trim();

/** `{ prop: value }` for the --v2p-* / --pk-* declarations in a block body. */
function props(body: string) {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--(?:v2p|pk)-[a-z0-9-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = squash(m[2]);
  return out;
}

/** Selector pieces, splitting on commas outside parentheses. */
function pieces(sel: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const SCOPE_ONLY =
  /^\.needt-v3(\[data-theme="[a-z]+"\]|:is\(\[data-theme="[a-z]+"\](,\s*\[data-theme="[a-z]+"\])*\))?$/;

function themeSides() {
  const css = strip(readFileSync(join(root, "v3/themes.css"), "utf8"));
  const sides: Record<"dark" | "light", Record<string, string>> = {
    dark: {},
    light: {},
  };
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const ps = pieces(m[1].replace(/\s+/g, " "));
    if (!ps.length || !ps.every((p) => SCOPE_ONLY.test(p))) continue;
    const side = /"dark"|"dim"/.test(ps.join(" ")) ? "dark" : "light";
    Object.assign(sides[side], props(m[2]));
  }
  return sides;
}

function nested(cls: "dark" | "paper") {
  const css = strip(
    readFileSync(join(root, "v3-overrides/motion.css"), "utf8")
  );
  // cls is one of two literals above, never input.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const re = new RegExp(`\\.needt-v3 \\.${cls}\\s*\\{([^{}]*)\\}`);
  const m = re.exec(css);
  return m ? props(m[1]) : {};
}

describe("nested theme classes", () => {
  const sides = themeSides();
  const both = Object.keys(sides.dark).filter((k) => k in sides.light);

  it("the vendored themes declare the phone tokens for both sides", () => {
    expect(both.length).toBeGreaterThan(20);
    expect(both).toEqual(expect.arrayContaining(["--v2p-ink", "--v2p-plate"]));
  });
  it(".dark carries every theme-following token with the dark value", () => {
    const got = nested("dark");
    for (const k of both) expect(got[k]).toBe(sides.dark[k]);
  });
  it(".paper carries them with the light value", () => {
    const got = nested("paper");
    for (const k of both) expect(got[k]).toBe(sides.light[k]);
  });
  it("an inverse plate reads the opposite ink from the frame", () => {
    expect(nested("dark")["--v2p-ink"]).not.toBe(nested("paper")["--v2p-ink"]);
  });
});
