import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * Budget's frame on the phone (15.11.26): an iframe is a replaced element, so
 * `top: 0; bottom: N` does not stretch it and `height: auto` falls back to the
 * intrinsic 150px. The phone rule must state the height itself.
 */
const css = readFileSync(
  path.join(process.cwd(), "src/styles/v3-overrides/budget.css"),
  "utf8"
);

function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("Budget frame on the phone", () => {
  const phone = rule('.needt-v3[data-ui="phone"] .bd-frame');

  it("never leaves the height to `auto`", () => {
    expect(phone).not.toMatch(/height:\s*auto/);
  });

  it("states a height that stops above the menu pill", () => {
    expect(phone).toMatch(/height:\s*calc\(100%[^;]*84px\)/);
  });
});
