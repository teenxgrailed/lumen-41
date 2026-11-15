/**
 * The phone sign-in's provider pill ("Continue with Google"): a column item
 * must keep its own 52px (the vendored `flex: 1` collapsed it to its text and
 * the card clipped it), and the quiet pill gets a hairline so it has an edge on
 * the dark plate as well as the light one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "src/styles/v3-overrides/auth-sky.css"),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("phone provider pill", () => {
  it("is not flexed to nothing inside the column", () => {
    expect(rule(".needt-v3 .mau-pair > .mau-btn")).toContain("flex: none");
  });

  it("wears a hairline in the ladder's line colour, Apple excepted", () => {
    const edge = rule(
      '.needt-v3 .mau-btn.is-quiet[data-provider]:not([data-provider="apple"])'
    );
    expect(edge).toContain("inset 0 0 0 1px var(--v2p-line)");
  });
});
