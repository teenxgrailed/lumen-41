/**
 * The dock draws every mark in one ink. A mark that is a solid shape with a
 * lighter detail cut into it (the tick on the tasks square, the lines on a
 * page) used to go through `filter: brightness(0)`, which turned the detail
 * black as well: the owner's phone showed solid black squares (23.11.26).
 *
 * The rule now: a dock glyph that draws a detail in the surface colour must be
 * in DOCK_DUO, the CSS must set the ink and the cut for it, and none of its
 * hues may be a bare literal the ink cannot reach.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GLYPHS } from "../../../glyphs/glyph-data";
import { DOCK_DUO, DOCK_GLYPH } from "../dock-glyphs";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/bottom-bar-float.css"),
  "utf8"
);

describe("dock glyph ink", () => {
  it("every dock glyph with a surface-colour detail is drawn as a duo", () => {
    for (const name of new Set(Object.values(DOCK_GLYPH))) {
      if (!name) continue;
      const cutsADetail = GLYPHS[name].body.includes("var(--surface-raised)");
      if (cutsADetail) expect(DOCK_DUO.has(name)).toBe(true);
    }
  });

  it("a duo glyph leaves no bare hue the one ink cannot reach", () => {
    for (const name of DOCK_DUO) {
      const body = GLYPHS[name].body;
      // hex colours and oklch literals outside a `var(--g-…, fallback)`
      const stripped = body.replace(/var\(--g-[a-z]+, [^)]*\)\)?/g, "");
      expect(stripped).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      expect(stripped).not.toContain("oklch(0.62 0.19 300)");
    }
  });

  it("the stylesheet sets ink and cut for a duo, resting and active", () => {
    expect(css).toMatch(/\.nfb-slot \.nva-glyph\.nfb-duo \{[^}]*--accent:/);
    expect(css).toContain("--surface-raised: var(--nfb-cut)");
    expect(css).toMatch(
      /\.nfb-slot\.is-on \.nva-glyph\.nfb-duo \{[^}]*--nfb-cut: var\(--v3-raised-ink\)/
    );
    // a duo must not be run through the one-ink filter
    expect(css).toMatch(/\.nva-glyph\.nfb-duo \{[^}]*filter: none/);
  });
});
