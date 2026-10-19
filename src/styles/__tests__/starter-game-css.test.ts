import { readFileSync } from "fs";
import { join } from "path";

/**
 * The Starter game's stylesheet: no colour of its own (everything reads the
 * theme tokens), and calm motion that stops under prefers-reduced-motion.
 */
const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/starter-game.css"),
  "utf8"
);
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("starter-game.css", () => {
  it("carries no colour of its own", () => {
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    // shadows may be black with alpha; no other rgb()/hsl() literal
    const literals =
      code.match(/\b(?:rgb|hsl|oklch|lab)a?\(\s*\d[^)]*\)/g) ?? [];
    expect(literals.filter((l) => !/^rgba\(0,\s*0,\s*0,/.test(l))).toEqual([]);
  });

  it("takes the four group hues from the project colour set and the mark", () => {
    expect(code).toMatch(/--sg-today:\s*var\(--info\)/);
    expect(code).toMatch(/--sg-week:\s*var\(--accent\)/);
    expect(code).toMatch(/--sg-habit:\s*var\(--success\)/);
    expect(code).toMatch(/--sg-project:\s*var\(--v2p-lav\)/);
  });

  it("stops every animation under prefers-reduced-motion", () => {
    const block = code.slice(code.indexOf("prefers-reduced-motion"));
    for (const selector of [
      ".sg-tile",
      ".sg-lane-item",
      ".sg-lane.is-solved",
      ".sg-msg",
      ".sg-plan-r",
      ".sg-shell",
      ".sg-prev-t",
      ".sg-prev-bar",
    ]) {
      expect(block).toContain(selector);
    }
    expect(block).toMatch(/animation:\s*none\s*!important/);
  });

  it("has no mascots, confetti or sounds", () => {
    expect(code).not.toMatch(/confetti|mascot|\.mp3|\.wav|audio/i);
  });
});
