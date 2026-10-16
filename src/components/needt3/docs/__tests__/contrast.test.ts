import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AA_LARGE,
  AA_TEXT,
  DOC_PAGES,
  DOC_PRESETS,
  DOC_TEXTS,
  DOC_TOKEN_FALLBACK,
  type TokenReader,
  contrast,
  inkFor,
  pageVars,
  rgbOf,
} from "../style";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3/themes.css"),
  "utf8"
);
const SHIPPED: Record<string, string> = {};
for (const m of css.matchAll(
  /^\s*(--doc-(?:page-[a-z]+-[ld]|ink-(?:dark|light)|text-[a-z]+-(?:dk|lt))):\s*(#[0-9a-f]{6});/gim
)) {
  SHIPPED[m[1]] = m[2];
}
const read: TokenReader = (n) => SHIPPED[n] ?? "";

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A ladder step `.dt-themed` draws (ink at an alpha), laid over the page. */
function over(ink: string, alpha: number, page: string) {
  const [a, b] = [rgb(ink), rgb(page)];
  const out = a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

describe("document colours against themes.css", () => {
  it("the fallback table is the shipped tokens", () => {
    expect(DOC_TOKEN_FALLBACK).toEqual(SHIPPED);
  });

  const sides = ["l", "d"] as const;
  for (const pg of DOC_PAGES) {
    for (const text of DOC_TEXTS) {
      for (const side of sides) {
        it(`${pg.id} page, ${text.id} text, ${side === "l" ? "Light" : "Dark"} app: body 4.5:1, headings 3:1`, () => {
          const page = SHIPPED[side === "l" ? pg.l : pg.d];
          const ink = inkFor(page, text.id, read);
          // Body text (the ink itself) and the title / headings (--dt-head).
          expect(contrast(page, ink)).toBeGreaterThanOrEqual(AA_TEXT);
          expect(contrast(page, ink)).toBeGreaterThanOrEqual(AA_LARGE);
          // Secondary text on the ladder (.85) is still body text.
          expect(contrast(page, over(ink, 0.85, page))).toBeGreaterThanOrEqual(
            AA_TEXT
          );
          // Tertiary (.72) is meta; it must at least read as large text.
          expect(contrast(page, over(ink, 0.72, page))).toBeGreaterThanOrEqual(
            AA_LARGE
          );
        });
      }
    }
  }

  it("a choice that cannot read gives way to one that can", () => {
    // Light text on the white page and Dark text on the black one are the
    // ghost-text cases; both come back readable.
    expect(
      contrast("#ffffff", inkFor("#ffffff", "light", read))
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast("#161618", inkFor("#161618", "dark", read))
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("every preset reads on both sides, from the real tokens", () => {
    for (const p of DOC_PRESETS) {
      const v = pageVars(
        { ...p.style, cover: null, separator: "line", wide: false },
        read
      );
      for (const side of sides) {
        const page = v[`--dt-page-${side}`];
        const head = v[`--dt-head-${side}`];
        expect(rgbOf(head)).toBe(v[`--dt-ink-${side}`]);
        expect(contrast(page, head)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("an unreadable token falls back to the shipped one, never to nothing", () => {
    const v = pageVars(
      { ...DOC_PRESETS[0].style, cover: null, separator: "line", wide: false },
      () => ""
    );
    expect(v["--dt-page-l"]).toBe("#ffffff");
    expect(v["--dt-ink-l"]).toBe(rgbOf("#1c1d20"));
    expect(v["--dt-ink-d"]).toBe(rgbOf("#f2f1ee"));
  });
});
