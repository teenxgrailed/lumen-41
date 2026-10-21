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

  it("the top band is three masked blur steps, 104 px", () => {
    expect(shell).toContain("blur(3px)");
    expect(shell).toContain("blur(9px)");
    expect(shell).toContain("blur(20px) saturate(1.4)");
    expect(ground).toContain("--ps-top-h: max(104px,");
  });

  it("the fog is 128 px, 170 px in a Safari tab", () => {
    expect(ground).toContain("--ps-fog-h: max(128px,");
    expect(ground).toMatch(
      /html\[data-display-mode="browser"\] \.needt-v3\[data-ui="phone"\] \.pk-fog \{\s*--ps-fog-h: 170px/
    );
  });

  it("no ps- layer paints a background-colour: gradients and masks only", () => {
    expect(shell).not.toMatch(/background(-color)?:\s*(#|rgb|var\(--v2p)/);
  });

  it("the fade is on each layer, never on the band hosts", () => {
    expect(shell).toContain(".ps-top > *");
    expect(shell).not.toMatch(/\.pk-topband \{[^}]*opacity/);
    expect(shell).not.toMatch(/\.pk-fog \{[^}]*opacity/);
  });

  it("the screen behind a pull scales to 94% and moves down 18 px", () => {
    expect(shell).toContain("translateY(calc(var(--ps-pull, 0) * 18px))");
    expect(shell).toContain("scale(calc(1 - var(--ps-pull, 0) * 0.06))");
  });
});
