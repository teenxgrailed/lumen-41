/**
 * The desktop app's stylesheets must never reach a browser tab: every rule in
 * them is gated by the `data-desktop` attribute the shell's bridge sets (or by
 * a class only the desktop quick-add page renders).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function selectors(file: string): string[] {
  const css = readFileSync(
    join(process.cwd(), "src/styles/v3-overrides", file),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{/g, "");
  const out: string[] = [];
  for (const block of css.split("}")) {
    const head = block.split("{")[0];
    if (!head.trim()) continue;
    for (const one of head.split(","))
      out.push(one.replace(/\s+/g, " ").trim());
  }
  return out;
}

describe("desktop stylesheets", () => {
  it("desktop-app.css only matches inside the desktop shell", () => {
    const all = selectors("desktop-app.css");
    expect(all.length).toBeGreaterThan(10);
    for (const selector of all) {
      expect(selector).toMatch(/^html\[data-desktop/);
    }
  });

  it("vibrancy rules need the shell to have said it gave the window one", () => {
    const sidebar = selectors("desktop-app.css").filter(
      (s) =>
        /shell-sidebar-stack|\.tab-bar|chat-dock-slot|ambient-backdrop/.test(
          s
        ) &&
        // the shared, non-translucent chrome rule (no text selection)
        s !== "html[data-desktop] .needt-v3 .tab-bar"
    );
    expect(sidebar.length).toBeGreaterThan(3);
    for (const selector of sidebar) {
      expect(selector).toContain('data-desktop="mac"');
      expect(selector).toContain('data-vibrancy="on"');
    }
  });

  it("the toggle starts at x 78: bar padding 76 plus the button's 2 px frame", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/v3-overrides/desktop-app.css"),
      "utf8"
    );
    expect(css).toMatch(
      /html\[data-desktop="mac"\] \.needt-v3 \.shell-tab-bar-tab-bar \{\s*padding-left: 76px;/
    );
  });

  it("desktop-quick-add.css only matches the quick-add page", () => {
    for (const selector of selectors("desktop-quick-add.css")) {
      expect(selector).toMatch(/data-desktop-quick|dk-qa/);
    }
  });
});
