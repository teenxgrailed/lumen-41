/**
 * The admin sheet fixes the black inputs on the Light theme: the shadcn
 * Input reads --input-bg, which :root derives from the dark palette, so the
 * v3 scope has to redefine the whole chain from the v3 ladder.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type Rule } from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/admin.css"),
  "utf8"
);
const root = postcss.parse(css);

function declsOf(selector: string) {
  const out: Record<string, string> = {};
  root.walkRules((rule: Rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((d) => {
      out[d.prop] = d.value;
    });
  });
  return out;
}

describe("admin.css", () => {
  const scope = declsOf(".needt-v3 .admin-shell");

  it("redefines every token an input draws with, from the v3 ladder", () => {
    for (const token of [
      "--surface-input",
      "--input-bg",
      "--input-border",
      "--input-border-focus",
      "--border-subtle",
      "--surface-hover",
    ]) {
      expect(scope[token]).toBeDefined();
    }
    expect(scope["--input-bg"]).toBe("var(--surface-input)");
    expect(scope["--surface-input"]).toMatch(/^var\(--fill-\d\)$/);
  });

  it("uses no literal hex colour in the bridge, so Light, Dark and Time all follow", () => {
    for (const value of Object.values(scope)) {
      expect(value).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it("has a dark variant for the shadcn text tokens", () => {
    const dark = declsOf('.needt-v3[data-theme="dark"] .admin-shell');
    expect(dark["--muted-foreground"]).toBeDefined();
  });

  it("is imported by the v3 entry, after the vendored sheets", () => {
    const imports = [
      ...readFileSync("src/styles/v3-entry.css", "utf8").matchAll(
        /@import "([^"]+)"/g
      ),
    ].map((m) => m[1]);
    expect(imports.indexOf("./v3-overrides/admin.css")).toBeGreaterThan(
      imports.indexOf("./v3/index.css")
    );
  });

  it("uses no 14px chrome type", () => {
    expect(css).not.toMatch(/font-size:\s*14px/);
  });
});
