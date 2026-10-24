/**
 * Phone shell edges (additions-2/phone-shell, ps-). The numbers are the
 * spec's; the Safari rule is the one confirmed on a device: nothing fixed,
 * wide and painted touches the top or bottom edge.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { pkPsK } from "@/components/needt3/phone/kit/scroll";

const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "src/styles/v3-overrides", f), "utf8");
const shell = read("phone-shell.css");
const ground = read("phone-ground.css");

describe("phone shell (ps-)", () => {
  it("--ps-k is clamp((scrollY - 8) / 44, 0, 1)", () => {
    expect(pkPsK(0)).toBe(0);
    expect(pkPsK(8)).toBe(0);
    expect(pkPsK(30)).toBeCloseTo(0.5);
    expect(pkPsK(52)).toBe(1);
    expect(pkPsK(900)).toBe(1);
  });

  it("the top band is three masked blur steps, 104 px (52 in a Safari tab)", () => {
    expect(shell).toContain("blur(3px)");
    expect(shell).toContain("blur(9px)");
    expect(shell).toContain("blur(20px) saturate(1.4)");
    // --v3-top is at least 52 px in the installed app, 0 in a Safari tab
    expect(ground).toContain("--ps-top-h: calc(var(--v3-top) + 52px)");
  });

  it("the fog is 128 px, 170 px with Safari's tab bar at the bottom", () => {
    expect(ground).toContain("--ps-fog-h: max(128px,");
    expect(ground).toMatch(
      /html\[data-display-mode="browser"\]\[data-safari-bar="bottom"\]\s+\.needt-v3\[data-ui="phone"\]\s+\.pk-fog \{\s*--ps-fog-h: 170px/
    );
  });

  it("no ps- layer paints a background-colour: gradients and masks only", () => {
    expect(shell).not.toMatch(/background(-color)?:\s*(#|rgb|var\(--v2p)/);
  });

  it("the blur steps are ps-shell.css's masked backdrop-filters, stop for stop, and paint nothing", () => {
    for (const [step, mask] of [
      [
        ".ps-top .pk-blur.b1",
        "linear-gradient(to top, transparent 0, #000 28px)",
      ],
      [
        ".ps-top .pk-blur.b2",
        "linear-gradient(to top, transparent 10px, #000 44px)",
      ],
      [
        ".ps-top .pk-blur.b3",
        "linear-gradient(to top, transparent 22px, #000 60px)",
      ],
      [
        ".ps-bot .pk-blur.b1",
        "linear-gradient(to bottom, transparent 0, #000 46px)",
      ],
      [
        ".ps-bot .pk-blur.b2",
        "linear-gradient(to bottom, transparent 30px, #000 88px)",
      ],
    ]) {
      const start = shell.indexOf(`${step} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      const body = shell.slice(start, shell.indexOf("}", start));
      expect(body).toContain(`mask: ${mask};`);
      expect(body).toContain("backdrop-filter: blur(");
      // Safari samples colour: a blur step has none, so it may reach the edge
      expect(body).not.toMatch(/background/);
    }
  });

  it("the fade is on each layer, never on the band hosts", () => {
    expect(shell).toContain(".ps-top > *");
    expect(shell).not.toMatch(/\.pk-topband \{[^}]*opacity/);
    expect(shell).not.toMatch(/\.pk-fog \{[^}]*opacity/);
  });
});
