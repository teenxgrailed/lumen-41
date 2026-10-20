/**
 * The phone page scrolls like a document (owner decision 2026-10-20). Nothing
 * that paints is fixed to the top or bottom edge at rest, so Safari 26 paints
 * its bars from the page colour, which is the app theme's ground.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "src/styles/v3-overrides/phone-ground.css"),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("phone page ground", () => {
  it("the scope is not fixed and is not sized by a fixed height", () => {
    const body = rule('.needt-v3[data-ui="phone"]');
    expect(body).not.toContain("position: fixed");
    expect(body).not.toContain("inset: 0");
    expect(body).toContain("background: var(--v2p-ground)");
    expect(css).not.toContain('[data-ui="phone"]::before');
    expect(css).not.toContain("v3-edge-tint");
  });

  it("html and body wear the ground and grow with the page", () => {
    const body = rule(
      'html:has(.needt-v3[data-ui="phone"]),\nhtml:has(.needt-v3[data-ui="phone"]) body'
    );
    expect(body).toContain("background-color: #f6f6f3 !important");
    expect(body).toContain("height: auto");
    const dark = rule(
      'html:has(.needt-v3[data-ui="phone"][data-theme="dark"]),\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dark"]) body,\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dim"]),\nhtml:has(.needt-v3[data-ui="phone"][data-theme="dim"]) body'
    );
    expect(dark).toContain("background-color: #141416 !important");
  });

  it("the screen has no inner scroller", () => {
    const scroll = rule('.needt-v3[data-ui="phone"] .pk-scroll');
    expect(scroll).toContain("overflow: visible");
    expect(scroll).toContain("padding-top: var(--v3-top)");
    expect(css).toContain("--v3-top: max(52px, env(safe-area-inset-top, 0px))");
  });

  it("the layers that stay put are fixed, and only those", () => {
    const fixed = rule(
      '.needt-v3[data-ui="phone"] :is(.pk-topband, .pk-fog, .pk-compact, .pk-pull),\n.needt-v3[data-ui="phone"]\n  :is(.pk-scrim, .pk-sheet-layer, .nva, .pk-sweep.is-screen)'
    );
    expect(fixed).toContain("position: fixed");
  });

  it("bottom-anchored phone chrome floats above the safe-area inset", () => {
    for (const [sel, px] of [
      [".nva-body", 10],
      [".pd-actbar", 26],
      [".pov-snack", 112],
      [".ma-menu-pill", 14],
    ] as const) {
      expect(rule(`.needt-v3[data-ui="phone"] ${sel}`)).toContain(
        `bottom: calc(${px}px + var(--v3-sab))`
      );
    }
    expect(rule('.needt-v3[data-ui="phone"] .pk-sheet')).toContain(
      "padding-bottom: var(--v3-sab)"
    );
    expect(rule('.needt-v3[data-ui="phone"] .pk-tail')).toContain(
      "132px + var(--v3-sab)"
    );
    expect(css).toContain("--v3-sab: env(safe-area-inset-bottom, 0px)");
  });

  it("the sign-in scope is fixed to the viewport (unchanged)", () => {
    const auth = readFileSync(
      path.join(process.cwd(), "src/components/needt3/auth/AuthScope.tsx"),
      "utf8"
    );
    expect(auth).toContain("fixed inset-0");
  });

  it("the scope grows with the page on the phone and is dvh-tall off it", () => {
    const root = readFileSync(
      path.join(process.cwd(), "src/components/needt3/root/V3Root.tsx"),
      "utf8"
    );
    expect(root).toContain('ui === "phone" ? "min-h-dvh"');
    expect(root).toContain("h-dvh min-h-0 overflow-hidden");
    expect(root).toContain("data-ui={ui}");
    expect(root).toContain("PHONE_GROUND[resolved.side]");
  });
});
