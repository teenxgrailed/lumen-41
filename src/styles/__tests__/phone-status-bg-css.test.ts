/**
 * The ground under the status bar (owner decision 23.11.26). It must never
 * become a Safari 26 / 27 band: nothing fixed touches the top edge, and a
 * Safari tab does not get it at all (see phone-status-bg.css).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const css = read("src/styles/v3-overrides/phone-status-bg.css");

const flat = css.replace(/\s+/g, " ");

function rule(selector: string): string {
  const start = flat.lastIndexOf(`${selector.replace(/\s+/g, " ")} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf("}", start));
}

const STANDALONE =
  'html[data-display-mode="standalone"] .needt-v3[data-ui="phone"] .pk-statusbg';

describe("status bar ground", () => {
  it("is off everywhere but the installed app: a Safari tab gets nothing", () => {
    expect(flat).toContain(".pk-statusbg { display: none; }");
    // every other rule that names the strip is scoped to the standalone attribute
    const bare = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((b) => b.split("{")[0].replace(/\s+/g, " ").trim())
      .filter((sel) => sel.includes(".pk-statusbg") && sel !== ".pk-statusbg");
    expect(bare.length).toBeGreaterThan(0);
    for (const sel of bare)
      expect(sel).toContain('html[data-display-mode="standalone"]');
  });

  it("the host is fixed, zero tall and parked at the inner edge of the bar", () => {
    const host = rule(STANDALONE);
    expect(host).toContain("position: fixed");
    expect(host).toContain("top: var(--v3-sat)");
    expect(host).toContain("height: 0");
    expect(host).toContain("pointer-events: none");
    // no background of its own: Safari reads that, not a child's
    expect(host).not.toMatch(/background/);
    expect(host).not.toMatch(/backdrop-filter/);
  });

  it("no colour reaches the display edge on iOS, and the blur may", () => {
    const wash = rule(`${STANDALONE}::after`);
    expect(wash).toContain("top: calc(var(--v3-gap-top) - var(--v3-sat))");
    expect(wash).toContain("background: linear-gradient");
    const blur = rule(`${STANDALONE}::before`);
    expect(blur).toContain("backdrop-filter: blur(14px)");
    expect(blur).toContain("-webkit-backdrop-filter: blur(14px)");
    expect(blur).not.toContain("background");
  });

  it("rests its blur while a sheet, the menu or a screen moves", () => {
    const at = css.indexOf(":has([data-pk-moving], [data-nva-moving])");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain(
      "backdrop-filter: none"
    );
  });

  it("collapses to nothing where the web view starts below the bar (inset 0)", () => {
    expect(css).toContain("--sb-out: min(6px, calc(var(--v3-sat) * 1000))");
    expect(css).toContain("--sb-in: min(10px, var(--v3-sat))");
    expect(css).toContain("--v3-sat: env(safe-area-inset-top, 0px)");
  });

  it("stands above the page and its fog, below the dock, scrims and sheets", () => {
    const z = Number(rule(STANDALONE).match(/z-index: (\d+)/)?.[1]);
    const kit = read("src/styles/v3/phone-kit.css");
    const zOf = (sel: string) => {
      const at = kit.indexOf(`${sel} {`);
      return Number(
        kit.slice(at, kit.indexOf("}", at)).match(/z-index: (\d+)/)?.[1]
      );
    };
    expect(z).toBeGreaterThan(zOf(".needt-v3 .pk-fog"));
    expect(z).toBeLessThan(zOf(".needt-v3 .pk-scrim"));
    expect(z).toBeLessThan(zOf(".needt-v3 .pk-sheet-layer"));
    const nav = read("src/styles/v3/nav-a.css");
    expect(z).toBeLessThan(
      Number(nav.match(/\.nva \{[^}]*z-index: (\d+)/)?.[1])
    );
  });

  it("wears the ground, not an accent or a grey, and follows a page's paper", () => {
    expect(css).toContain("--sb-fog: var(--ps-fog)");
    expect(css).toContain("var(--v3-page-ground-l, #f6f6f3)");
    expect(css).toContain("var(--v3-page-ground-d, #141416)");
    expect(css).not.toMatch(/--(accent|v2p-ink)/);
  });

  it("is mounted once, in the frame, whatever the width", () => {
    const frame = read("src/components/needt3/root/ShellFrame.tsx");
    expect(frame).toContain("<PkStatusBg />");
    expect(read("src/styles/v3-entry.css")).toContain("phone-status-bg.css");
  });
});
