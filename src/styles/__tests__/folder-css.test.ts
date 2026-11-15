/**
 * The folder keeps the chrome rules (PORT.md): 13px and 12px type, no 14px;
 * the accent only as the focus ring, never a fill; reduced motion stills it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const css = readFileSync(
  join(process.cwd(), "src/styles/v3-overrides/folder.css"),
  "utf8"
);

describe("folder.css", () => {
  it("uses only 13px and 12px type", () => {
    const sizes: string[] = [];
    postcss.parse(css).walkDecls((d) => {
      if (d.prop === "font" && d.value !== "inherit")
        sizes.push(d.value.split(/\s+/)[1].split("/")[0]);
      if (d.prop === "font-size") sizes.push(d.value);
    });
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(["12px", "13px"]).toContain(s);
  });

  it("never fills with the accent", () => {
    postcss.parse(css).walkDecls((d) => {
      if (/^(background|background-color)$/.test(d.prop))
        expect(d.value).not.toMatch(/--accent|--fill-accent/);
    });
  });

  it("does not move the sheets under prefers-reduced-motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*--nx-lift: 0px[\s\S]*transition: none/
    );
  });
});
