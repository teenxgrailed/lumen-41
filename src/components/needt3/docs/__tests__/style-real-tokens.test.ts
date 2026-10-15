/**
 * Every page colour x text choice the Style panel offers, read with the
 * shipped tokens (src/styles/v3/themes.css), must draw ink that can be read
 * on both the Light and the Dark reading of the page: the same document is
 * opened in either theme.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DOC_DEFAULT,
  DOC_PAGES,
  DOC_TEXTS,
  MIN_ASKED_INK_CONTRAST,
  contrast,
  pageVars,
} from "../style";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3/themes.css"),
  "utf8"
);
const tokens = new Map<string, string>();
for (const m of css.matchAll(
  /^\s*(--doc-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/gm
)) {
  tokens.set(m[1], m[2]);
}
const read = (name: string) => tokens.get(name) ?? "";

describe("shipped document colours", () => {
  it("has the tokens the style model reads", () => {
    for (const p of DOC_PAGES) {
      expect(read(p.l)).not.toBe("");
      expect(read(p.d)).not.toBe("");
    }
    expect(read("--doc-ink-dark")).not.toBe("");
    expect(read("--doc-ink-light")).not.toBe("");
  });

  it("no page colour with any text choice draws unreadable ink in either theme", () => {
    const bad: string[] = [];
    for (const p of DOC_PAGES) {
      for (const t of DOC_TEXTS) {
        const v = pageVars({ ...DOC_DEFAULT, page: p.id, text: t.id }, read);
        const l = contrast(v["--dt-page-l"], v["--dt-head-l"]);
        const d = contrast(v["--dt-page-d"], v["--dt-head-d"]);
        if (l < MIN_ASKED_INK_CONTRAST) bad.push(`${p.id}/${t.id} light ${l}`);
        if (d < MIN_ASKED_INK_CONTRAST) bad.push(`${p.id}/${t.id} dark ${d}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("auto and the hues keep to 4.5:1", () => {
    for (const p of DOC_PAGES) {
      for (const t of DOC_TEXTS.filter(
        (x) => x.id !== "dark" && x.id !== "light"
      )) {
        const v = pageVars({ ...DOC_DEFAULT, page: p.id, text: t.id }, read);
        expect([
          p.id,
          t.id,
          contrast(v["--dt-page-l"], v["--dt-head-l"]) >= 4.5,
        ]).toEqual([p.id, t.id, true]);
        expect([
          p.id,
          t.id,
          contrast(v["--dt-page-d"], v["--dt-head-d"]) >= 4.5,
        ]).toEqual([p.id, t.id, true]);
      }
    }
  });
});
