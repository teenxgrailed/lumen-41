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

  it("the open menu's rows are not dotted over by the card's own fog", () => {
    const start = shell.indexOf('.needt-v3[data-ui="phone"] .nva-fog-dots {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(shell.slice(start, shell.indexOf("}", start))).toContain(
      "display: none"
    );
  });

  describe("the fog dots move (owner 2026-10-26: they were still)", () => {
    const dots = '.needt-v3[data-ui="phone"] .pk-fog > .pk-fog-dots';
    const body = (sel: string) => {
      const start = shell.indexOf(`${sel} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return shell.slice(start, shell.indexOf("}", start));
    };

    it("every dot layer declares a drift, a bob and a pulse, running by default", () => {
      const a = body(dots);
      expect(a).toContain("v3-pk-fog-drift");
      expect(a).toContain("v3-pk-fog-bob");
      expect(a).toContain("v3-pk-fog-pulse");
      expect(a).toMatch(/infinite/);
      // no `paused` in the shorthand: nothing but an off rule stops them
      expect(a).not.toMatch(/\bpaused\b/);
      expect(shell).toMatch(/@keyframes v3-pk-fog-pulse/);
      // the three layers differ, so the pattern keeps changing
      expect(body(`${dots}.is-2`)).toContain("animation-duration");
      expect(body(`${dots}.is-3`)).toContain("animation-duration");
    });

    it("the drift is fast enough to read as motion (at least 2 px/s)", () => {
      const a = body(dots);
      const s = Number(a.match(/v3-pk-fog-drift (\d+)s/)?.[1]);
      expect(48 / s).toBeGreaterThanOrEqual(2);
    });

    it("they stop only for a hidden tab, a faded fog or the system's reduced motion", () => {
      expect(shell).toMatch(
        /\.pk-fog:not\(\[data-pk-live="1"\]\) > \.pk-fog-dots/
      );
      expect(shell).toMatch(/\.pk-screen\[data-pk-fog-on="0"\]/);
      const at = shell.indexOf("@media (prefers-reduced-motion: reduce)");
      expect(at).toBeGreaterThan(0);
      // nothing else switches them off for good
      const off = [...shell.matchAll(/([^{}]+)\{[^{}]*animation:\s*none/g)].map(
        (m) => m[1].replace(/\s+/g, " ").trim()
      );
      expect(off.length).toBe(2); // the off-screen pair, then reduced motion
    });

    it("they start live: the host is live in the markup, not only after an effect", () => {
      const screen = readFileSync(
        path.join(process.cwd(), "src/components/needt3/phone/kit/Screen.tsx"),
        "utf8"
      );
      expect(screen).toContain('data-pk-live="1"');
      expect(screen).not.toContain('data-pk-live="0"');
    });
  });
});
