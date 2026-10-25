/**
 * Phone shell edge (additions-2/phone-shell, ps-). The numbers are the
 * spec's; the Safari rule is the one confirmed on a device: nothing fixed,
 * wide and painted touches the top or bottom edge. Nothing is fixed at the
 * top at all (owner decision 2026-10-25).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "src/styles/v3-overrides", f), "utf8");
const shell = read("phone-shell.css");
const ground = read("phone-ground.css");

describe("phone shell (ps-)", () => {
  it("nothing is fixed at the top: no top band, no small title, no hand-over (owner decision 2026-10-25)", () => {
    for (const gone of [
      ".ps-top",
      ".ps-title",
      ".pk-compact",
      "--ps-k",
      "data-ps-on",
    ])
      expect(shell).not.toContain(gone);
    expect(ground).not.toContain(".pk-topband");
    const screen = readFileSync(
      path.join(process.cwd(), "src/components/needt3/phone/kit/Screen.tsx"),
      "utf8"
    );
    for (const gone of [
      "PkTopBand",
      "pk-topband",
      "pk-compact",
      "compactTitle",
      "--ps-k",
      "pkPsK",
    ])
      expect(screen).not.toContain(gone);
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

  it("the fog's blur steps are ps-shell.css's masked backdrop-filters, stop for stop, and paint nothing", () => {
    for (const [step, mask] of [
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

  it("the fade is on each layer, never on the fog host", () => {
    expect(shell).not.toMatch(/\.pk-fog \{[^}]*opacity/);
  });
});
