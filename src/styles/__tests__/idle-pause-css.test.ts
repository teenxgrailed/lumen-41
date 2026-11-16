import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(
  path.join(__dirname, "../v3-overrides/idle-pause.css"),
  "utf8"
);
const entry = fs.readFileSync(path.join(__dirname, "../v3-entry.css"), "utf8");

describe("idle pause stylesheet", () => {
  it("is loaded by the v3 entry", () => {
    expect(entry).toContain('"./v3-overrides/idle-pause.css"');
  });

  it("pauses, never removes, animations while data-needt-idle is set", () => {
    expect(css).toContain("html[data-needt-idle]");
    expect(css).toMatch(/animation-play-state:\s*paused\s*!important/);
    // no rule may cancel the animation or change its duration or iteration
    expect(css).not.toMatch(/animation:\s*none/);
    expect(css).not.toMatch(/animation-(name|duration|iteration-count):/);
  });

  it("covers pseudo-elements and leaves wait indicators moving", () => {
    expect(css).toContain("::before");
    expect(css).toContain("::after");
    for (const wait of [
      '[class*="spin"]',
      '[role="progressbar"]',
      '[aria-busy="true"]',
    ]) {
      expect(css).toContain(wait);
    }
  });
});
