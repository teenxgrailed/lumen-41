/**
 * The phone screen covers the whole display. The scope is `h-dvh`, which in an
 * installed iOS PWA ends above the bottom of the display and left a flat band
 * of the html colour under the dock. The phone scope is fixed to the viewport
 * and its ground sits on a fixed layer of its own.
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

describe("phone screen background layer", () => {
  it("the phone scope is fixed to the viewport, not sized by dvh", () => {
    const body = rule('.needt-v3[data-ui="phone"]');
    expect(body).toContain("position: fixed");
    expect(body).toContain("inset: 0");
    expect(body).toContain("height: auto");
    expect(body).not.toMatch(/dvh|svh|\bvh\b/);
    expect(body).toContain("background: var(--v2p-ground)");
  });

  it("the ground is a fixed inset-0 layer behind the content", () => {
    const body = rule('.needt-v3[data-ui="phone"]::before');
    expect(body).toContain("position: fixed");
    expect(body).toContain("inset: 0");
    expect(body).toContain("z-index: -1");
    expect(body).toContain("background: var(--v2p-ground)");
    expect(body).toContain("pointer-events: none");
  });

  it("bottom-anchored phone chrome keeps its distance by the safe-area inset", () => {
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
    expect(css).toContain("--v3-sab: env(safe-area-inset-bottom, 0px)");
  });

  it("the sign-in scope is fixed to the viewport too", () => {
    const auth = readFileSync(
      path.join(process.cwd(), "src/components/needt3/auth/AuthScope.tsx"),
      "utf8"
    );
    expect(auth).toContain("fixed inset-0");
    expect(auth).not.toContain("h-dvh");
  });

  it("the scope still carries the h-dvh utility the rule overrides", () => {
    const root = readFileSync(
      path.join(process.cwd(), "src/components/needt3/root/V3Root.tsx"),
      "utf8"
    );
    expect(root).toContain("h-dvh");
    expect(root).toContain("data-ui={ui}");
  });
});

describe("edge colours for the browser bars", () => {
  it("registers both as colours and re-points them per layer", () => {
    expect(css).toContain("@property --v3-edge-top");
    expect(css).toContain("@property --v3-edge-bottom");
    expect(css).toContain(":has(.pk-scrim.is-open, .pk-sheet-layer.is-open) {");
    expect(css).toContain(':has(.pk-pull[data-pk-pull="open"]) {');
    expect(css).toContain("--v3-edge-top: var(--sky-ground)");
  });
});
