/**
 * What the shared components' stylesheets promise, read as text: the 44px hit
 * area, one press scale, one disabled opacity, one raised level per stack, no
 * shadow / grey / 14px / accent fill of their own, dark mirrors light.
 */
import { scanCss } from "@/styles/__tests__/ds-guard-scan";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss, { type Rule } from "postcss";

const STYLES = path.resolve(__dirname, "../../../../styles/ds");
const read = (name: string) => readFileSync(path.join(STYLES, name), "utf8");
const components = read("components.css");
const tokens = read("tokens.css");
const root = postcss.parse(components);

function rules(match: (rule: Rule) => boolean): Rule[] {
  const out: Rule[] = [];
  root.walkRules((rule) => {
    if (match(rule)) out.push(rule);
  });
  return out;
}
const decl = (rule: Rule, prop: string) => {
  let value: string | undefined;
  rule.walkDecls(prop, (d) => {
    value = d.value;
  });
  return value;
};

describe("the hit area", () => {
  it("every interactive control is .ds-i, and .ds-i draws a 44px ::after", () => {
    const after = rules((r) => r.selector === ".needt-v3 .ds-i::after");
    expect(after).toHaveLength(1);
    expect(decl(after[0], "content")).toBe('""');
    expect(decl(after[0], "position")).toBe("absolute");
    // grows the box to --ds-hit when the control is smaller, never shrinks it
    expect(decl(after[0], "inset-block")).toMatch(/min\(0px/);
    expect(decl(after[0], "inset-inline")).toMatch(/min\(\s*0px/);
    expect(decl(after[0], "inset-block")).toContain("--ds-hit");
  });

  it("a control with a border says so, so the hit area still reaches 44", () => {
    const after = rules((r) => r.selector === ".needt-v3 .ds-i::after");
    expect(decl(after[0], "inset-block")).toContain("--ds-bw");
    expect(decl(after[0], "inset-inline")).toContain("--ds-bw");
    // every control that draws a border sets it
    const bordered = rules(
      (r) =>
        !!decl(r, "border") &&
        !/^(0|none)\b/.test(decl(r, "border")!) &&
        /\.ds-(chip|btn|icon-btn|seg-item|dock-item|row|switch)\b/.test(
          r.selector
        )
    );
    expect(bordered.length).toBeGreaterThan(0);
    for (const rule of bordered) expect(decl(rule, "--ds-bw")).toBe("1px");
  });

  it("the hit area is 44", () => {
    expect(tokens).toMatch(/--ds-hit:\s*44px/);
  });

  it("each control sets the height the hit area grows from", () => {
    // a control's visible height is --ds-h; without it the ::after has no base
    for (const selector of [
      ".needt-v3 .ds-btn",
      ".needt-v3 .ds-icon-btn",
      ".needt-v3 .ds-chip",
      ".needt-v3 .ds-seg",
      ".needt-v3 .ds-switch",
    ])
      expect(
        rules((r) => r.selector === selector).some((r) => decl(r, "--ds-h"))
      ).toBe(true);
  });

  it("the focus ring is one outline on .ds-i", () => {
    const focus = rules((r) => r.selector.includes(".ds-i:focus-visible"));
    expect(focus).toHaveLength(1);
    expect(decl(focus[0], "outline")).toContain("--ds-ring");
  });
});

describe("one press scale, one disabled opacity", () => {
  it("every scale() in a transform is the press token", () => {
    const scales: string[] = [];
    root.walkDecls("transform", (d) => {
      for (const m of d.value.matchAll(/scale\(([^)]*\)?)\)/g))
        scales.push(m[0]);
    });
    expect(scales.length).toBeGreaterThan(0);
    for (const s of scales) expect(s).toBe("scale(var(--ds-press-scale))");
  });

  it("the press scale and the disabled opacity are defined once", () => {
    expect(tokens.match(/--ds-press-scale:/g)).toHaveLength(1);
    expect(tokens.match(/--ds-disabled-opacity:/g)).toHaveLength(1);
  });

  it("every disabled state uses the disabled opacity", () => {
    const disabled = rules((r) =>
      /:disabled|aria-disabled|\[data-disabled\]/.test(r.selector)
    );
    const withOpacity = disabled.filter((r) => decl(r, "opacity"));
    expect(withOpacity.length).toBeGreaterThan(0);
    for (const r of withOpacity)
      expect(decl(r, "opacity")).toBe("var(--ds-disabled-opacity)");
  });
});

describe("one raised level per stack", () => {
  it("a lifted thing inside a lifted thing is flat: a hairline and nothing else", () => {
    const flat = rules(
      (r) =>
        r.selector.includes("[data-ds-lift]") &&
        /\[data-ds-lift\]\s*,?[^,]*\s\[data-ds-lift\]/.test(r.selector)
    );
    expect(flat).toHaveLength(1);
    expect(flat[0].selector).toContain(".ds-sheet");
    expect(decl(flat[0], "background")).toBe("transparent");
    expect(decl(flat[0], "box-shadow")).toBe("var(--ds-flat-ring)");
    expect(decl(flat[0], "backdrop-filter")).toBe("none");
  });

  it("the flat rule comes after every material it overrides", () => {
    const at = (needle: string) => components.indexOf(needle);
    const flat = at("[data-ds-lift], .ds-sheet) [data-ds-lift]");
    expect(flat).toBeGreaterThan(at('.ds-surface[data-variant="glass"]'));
    expect(flat).toBeGreaterThan(at('.ds-surface[data-variant="raised"]'));
  });

  it("the sheet panel is itself lifted, so a Surface inside it is flat", () => {
    expect(components).toMatch(
      /\.ds-sheet-panel\b[^{]*\{[^}]*--ds-raised-floating/
    );
  });
});

describe("the system draws only from its tokens", () => {
  const found = scanCss(components, "components.css");

  it("no box-shadow with a colour of its own", () => {
    expect(found.shadow).toBe(0);
  });
  it("no grey that is not a token", () => {
    expect(found.grey).toBe(0);
  });
  it("no 14px", () => {
    expect(found.font14).toBe(0);
  });
  it("every class is ds-", () => {
    expect(found.classes.filter((c) => !c.startsWith("ds-"))).toEqual([]);
  });

  it("the accent is a mark or a wash, never a surface or a button fill", () => {
    const fills: string[] = [];
    root.walkRules((rule) => {
      rule.walkDecls(/^background(-color)?$/, (d) => {
        if (/--ds-mark(?!-wash)|--accent(?!-)/.test(d.value))
          fills.push(`${rule.selector} { background: ${d.value} }`);
      });
    });
    // the one place the accent is solid: the switch knob, a mark
    expect(fills).toEqual([
      '.needt-v3 .ds-switch[data-state="on"] .ds-switch-knob { background: var(--ds-mark) }',
    ]);
  });

  it("no hard-coded font size: type comes from the type tokens", () => {
    const sizes: string[] = [];
    root.walkDecls(/^font(-size)?$/, (d) => {
      if (/\d+(\.\d+)?(px|rem)/.test(d.value.replace(/var\([^)]*\)/g, "")))
        sizes.push(d.value);
    });
    expect(sizes).toEqual([]);
  });

  it("type tokens: chrome 13 and 12, row 16, sheet title 28, nothing at 14", () => {
    expect(tokens).toMatch(/--ds-type-row:\s*500 16px/);
    expect(tokens).toMatch(/--ds-type-sheet-title:\s*600 28px/);
    expect(scanCss(tokens, "tokens.css").font14).toBe(0);
    expect(tokens).not.toMatch(/--ds-type[\w-]*:[^;]*\b14px/);
    expect(tokens).toContain("--ds-type-ui: var(--type-ui)");
    expect(tokens).toContain("--ds-type-meta: var(--type-meta)");
  });
});

describe("the scales", () => {
  const values = (prefix: string) =>
    tokens
      .split("\n")
      .filter((line) => line.trim().startsWith(`--ds-${prefix}`))
      .map((line) => line.match(/:\s*(\d+px)/)?.[1])
      .filter((value): value is string => !!value);

  it("space is 2 4 6 8 12 16 20 24", () => {
    expect(values("space-")).toEqual(
      ["2", "4", "6", "8", "12", "16", "20", "24"].map((n) => `${n}px`)
    );
  });

  it("six radii: 8 12 16 22 28 pill", () => {
    expect(values("radius-")).toEqual([
      "8px",
      "12px",
      "16px",
      "22px",
      "28px",
      "999px",
    ]);
    expect(tokens).toMatch(/--ds-radius-pill:\s*999px/);
  });

  it("ink is the six-step ladder and fills are the six steps", () => {
    for (const n of [100, 85, 70, 55, 40, 25])
      expect(tokens).toContain(`--ds-ink-${n}:`);
    for (const n of [2, 3, 4, 6, 8, 12])
      expect(tokens).toContain(`--ds-fill-${n}:`);
    expect(tokens).not.toMatch(/--ds-ink-(52|28|16)\b/);
  });
});

describe("dark mirrors light", () => {
  it("declares every raised alias in both themes", () => {
    const light = tokens.slice(0, tokens.indexOf(".needt-v3:is("));
    const dark = tokens.slice(tokens.indexOf(".needt-v3:is("));
    const names = (css: string) =>
      new Set(
        [
          ...css.matchAll(
            /(--ds-raised-[\w-]+|--ds-knob-off|--ds-flat-ring):/g
          ),
        ].map((m) => m[1])
      );
    const inLight = names(light);
    expect(inLight.size).toBeGreaterThan(8);
    expect([...inLight].filter((n) => !names(dark).has(n))).toEqual([]);
    expect([...names(dark)].filter((n) => !inLight.has(n))).toEqual([]);
  });

  it("dark reads the same scopes raised.css does", () => {
    expect(tokens).toContain('[data-theme="dark"]');
    expect(tokens).toContain('[data-theme="dim"]');
    expect(tokens).toContain(".v3-raised-dark");
  });
});
