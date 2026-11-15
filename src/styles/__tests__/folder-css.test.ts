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

  const rule = (sel: string) => {
    let found: postcss.Rule | undefined;
    postcss.parse(css).walkRules((r) => {
      if (r.selector.replace(/\s+/g, " ") === sel && !found) found = r;
    });
    return found;
  };
  const decl = (sel: string, prop: string) => {
    let v: string | undefined;
    rule(sel)?.walkDecls(prop, (d) => {
      v = d.value;
    });
    return v;
  };

  it("stacks back 0 < sheets 1-3 < front wall 4 < sticker 5, isolated", () => {
    expect(decl(".nx-folder-art", "isolation")).toBe("isolate");
    expect(decl(".nx-folder-back", "z-index")).toBeUndefined();
    expect(decl(".nx-folder-front", "z-index")).toBe("4");
    expect(decl(".nx-folder-sticker", "z-index")).toBe("5");
  });

  it("keeps the folder link out of the app's accent underline", () => {
    for (const sel of [".needt-v3 .nx-folder", ".needt-v3 .nx-folder:hover"]) {
      const sels = postcss
        .parse(css)
        .nodes.filter((n): n is postcss.Rule => n.type === "rule")
        .find((r) => r.selectors.includes(sel));
      expect(sels).toBeDefined();
      expect(sels?.toString()).toMatch(/text-decoration:\s*none/);
      expect(sels?.toString()).toMatch(/color:\s*inherit/);
    }
  });

  it("focuses with the app's shadow-focus only, and blurs the front only", () => {
    expect(decl(".nx-folder:focus-visible", "box-shadow")).toBe(
      "var(--shadow-focus)"
    );
    expect(decl(".nx-folder", "outline")).toBe("none");
    expect(decl(".nx-folder-back", "backdrop-filter")).toBeUndefined();
    expect(decl(".nx-folder-front", "backdrop-filter")).toBeDefined();
  });

  it("draws the ref's proportions: near-square, frosted front, bare sticker", () => {
    expect(decl(".nx-folder-art", "aspect-ratio")).toBe("1.15 / 1");
    expect(decl(".nx-folder-front", "backdrop-filter")).toBe("blur(14px)");
    expect(rule(".nx-folder-back, .nx-folder-front")).toBeDefined();
    expect(decl(".nx-folder-back, .nx-folder-front", "border-radius")).toBe(
      "18px"
    );
    expect(decl(".nx-folder-front", "background")).toMatch(/58%/);
    expect(decl(".nx-folder-sticker", "background")).toBeUndefined();
    expect(decl(".nx-folder-sticker", "box-shadow")).toBeUndefined();
    expect(decl(".nx-folder-sticker", "filter")).toMatch(/drop-shadow/);
  });
});
