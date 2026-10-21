/**
 * Phone motion contract (port rules 11 and 12, MOTION.md V-B8), checked on the
 * stylesheets V3Root actually loads: v3-entry.css -> the vendored v3/index.css
 * sheets, then v3-overrides/*.css, in that order.
 *
 * A static scan cannot see a computed style, so every check is about what a
 * rule SAYS: a phone selector that transitions or animates a layout property,
 * an entry animation that holds its end state, a loop that is not on the
 * allowlist, a will-change that is not a compositor property, and a glass
 * class that the "one blur while it moves" lists do not know about. A rule
 * that a later override with the identical selector switches off does not
 * count (the cascade decides, not the vendored text).
 *
 * The allowlists carry the reason. Adding to one is a design decision: ask.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AtRule, type Declaration, type Rule, parse } from "postcss";

const STYLES = join(__dirname, "..");

/** The files in load order, as V3Root loads them. */
function loadedFiles(): string[] {
  const entry = readFileSync(join(STYLES, "v3-entry.css"), "utf8");
  const out: string[] = [];
  for (const m of entry.matchAll(/@import "\.\/([^"]+)";/g)) {
    if (m[1] === "v3/index.css") {
      const idx = readFileSync(join(STYLES, "v3/index.css"), "utf8");
      for (const i of idx.matchAll(/@import "\.\/([^"]+)";/g))
        out.push(`v3/${i[1]}`);
    } else out.push(m[1]);
  }
  return out;
}

interface Decl {
  file: string;
  line: number;
  selector: string;
  /** Enclosing at-rules, e.g. "@media (prefers-reduced-motion: reduce)". */
  at: string;
  prop: string;
  value: string;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function atContext(rule: Rule): string {
  const parts: string[] = [];
  for (let p = rule.parent; p && p.type === "atrule"; p = p.parent)
    parts.push(`@${(p as AtRule).name} ${(p as AtRule).params}`);
  return parts.join(" ");
}

const files = loadedFiles();
const decls: Decl[] = [];
const keyframes = new Map<string, Set<string>>();
for (const file of files) {
  const root = parse(readFileSync(join(STYLES, file), "utf8"), { from: file });
  root.walkAtRules(/keyframes$/, (a) => {
    const props = new Set<string>();
    a.walkDecls((d) => {
      props.add(d.prop);
    });
    keyframes.set(a.params, props);
  });
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule") {
      const name = (rule.parent as AtRule).name;
      if (/keyframes$/.test(name)) return;
    }
    rule.walkDecls((d: Declaration) => {
      if (d.parent !== rule) return;
      decls.push({
        file,
        line: d.source?.start?.line ?? 0,
        selector: norm(rule.selector),
        at: atContext(rule),
        prop: d.prop,
        value: norm(d.value),
      });
    });
  });
}

/* A rule belongs to the phone when its selector names a phone class (the
   vendored phone sheets' prefixes, the plates, the menu, the sky chrome the
   phone auth uses) . The desktop's own classes are the desktop's business. */
const PHONE_CLASS =
  /\.(pk|pd|pov|ps|phb|ptk|pml|ppl|v2p|nva|ma|mau|px|iosf|pcd|pdc|p5|p6|p8|p12)-/;
const phoneDecls = decls.filter((d) => PHONE_CLASS.test(d.selector));

const LAYOUT_PROP =
  /^(width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset(-.+)?|margin(-.+)?|padding(-.+)?|grid-template(-.+)?|border(-(top|right|bottom|left))?(-(width|radius|style))?|border-.*-radius|font-size|font-weight|line-height|letter-spacing|flex|flex-basis|flex-grow|flex-shrink|gap|row-gap|column-gap|zoom)$/;

function transitionedProps(d: Decl): string[] {
  if (d.prop === "transition-property")
    return d.value.split(",").map((s) => s.trim());
  if (d.prop === "transition")
    return d.value.split(/,(?![^(]*\))/).map((s) => s.trim().split(/\s+/)[0]);
  return [];
}

/** Layout properties an animation's keyframes touch. */
function animatedProps(d: Decl): string[] {
  if (d.prop !== "animation" && d.prop !== "animation-name") return [];
  const out: string[] = [];
  for (const piece of d.value.split(/,(?![^(]*\))/)) {
    for (const word of piece.trim().split(/\s+/)) {
      const kf = keyframes.get(word);
      if (kf) out.push(...kf);
    }
  }
  return out;
}

/** The classes of a selector's last compound: what the rule styles. */
function targetClasses(selector: string): string[] {
  const first = norm(selector).split(",")[0];
  const last = first.split(/[\s>+~]+/).pop() ?? "";
  return [...last.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
}

/**
 * The later rules that style the same thing: the same selector, or one that
 * names every class of this rule's target (`:is(.a, .b)` covers `.a`).
 */
const later = (d: Decl) => {
  const want = targetClasses(d.selector);
  return decls.filter((o) => {
    const after =
      o.file !== d.file
        ? files.indexOf(o.file) > files.indexOf(d.file)
        : o.line > d.line;
    if (!after || /prefers-reduced-motion/.test(o.at)) return false;
    if (o.selector === d.selector) return true;
    return want.length > 0 && want.every((c) => o.selector.includes(`.${c}`));
  });
};

const where = (d: Decl) => `${d.file}:${d.line} ${d.selector}`;

/* ---------- 1. layout properties are never transitioned or animated ---------- */

/** `selector -> reason`. Each is a layout transition the phone really draws. */
const LAYOUT_ALLOW: Record<string, string> = {};

describe("phone transitions and animations touch no layout property", () => {
  it("has no transition or keyframe on width/height/margin/padding/grid/top/left/…/all", () => {
    const bad: string[] = [];
    for (const d of phoneDecls) {
      if (/prefers-reduced-motion/.test(d.at)) continue;
      const t = transitionedProps(d).filter(
        (p) => p === "all" || LAYOUT_PROP.test(p)
      );
      const a = animatedProps(d).filter((p) => LAYOUT_PROP.test(p));
      for (const p of [
        ...t.map((x) => `transition:${x}`),
        ...a.map((x) => `animation:${x}`),
      ]) {
        const kind = p.split(":")[0];
        const prop = p.split(":")[1];
        // switched off by a later rule on the same selector?
        const off = later(d).some((o) => {
          if (kind === "transition") {
            if (o.prop === "transition" && /^none\b/.test(o.value)) return true;
            if (
              o.prop === "transition-property" &&
              !transitionedProps(o).includes(prop) &&
              !transitionedProps(o).includes("all")
            )
              return true;
            if (
              o.prop === "transition" &&
              !transitionedProps(o).includes(prop) &&
              !transitionedProps(o).includes("all")
            )
              return true;
            return false;
          }
          return (
            (o.prop === "animation" || o.prop === "animation-name") &&
            /^none\b/.test(o.value)
          );
        });
        if (off) continue;
        if (LAYOUT_ALLOW[d.selector]) continue;
        bad.push(`${where(d)} ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/* ---------- 2. an entry plays once and does not hold its end state ---------- */

/** Entry animations that hold on purpose: they leave, or they are removed by
 *  script when they end. */
const FILL_ALLOW =
  /\.is-leaving|\.is-out|-out\b|\.pk-sweep|\.pov-snack|\.ps-page\.is-leaving/;

describe("phone entry animations use fill-mode backwards", () => {
  it("has no `both` or `forwards` fill on an entry (V-B8), unless a later rule resets it", () => {
    const bad: string[] = [];
    for (const d of phoneDecls) {
      if (d.prop !== "animation") continue;
      if (/prefers-reduced-motion/.test(d.at)) continue;
      if (!/\b(both|forwards)\b/.test(d.value)) continue;
      if (FILL_ALLOW.test(d.selector) || /v3-pk-sweep|-out\b/.test(d.value))
        continue;
      const reset = later(d).some(
        (o) =>
          (o.prop === "animation-fill-mode" &&
            /^(backwards|none)$/.test(o.value)) ||
          (o.prop === "animation" && !/\b(both|forwards)\b/.test(o.value))
      );
      if (!reset) bad.push(`${where(d)} ${d.value}`);
    }
    expect(bad).toEqual([]);
  });
});

/* ---------- 3. nothing loops at rest ---------- */

/** Selector -> why it may loop. The fog drift is the owner's one exception
 *  (MOTION.md), and only while the fog shows: see the second test. */
const LOOP_ALLOW: Record<string, string> = {
  ".needt-v3 .nva-fog-dots":
    "owner exception: halftone drift, only while the menu fog shows",
  ".needt-v3 .pk-fog > .pk-fog-dots":
    "owner exception: halftone drift, only while the band is live",
};

describe("phone loops", () => {
  it("only the allowlisted selectors have an infinite animation", () => {
    const bad = phoneDecls
      .filter(
        (d) =>
          (d.prop === "animation" || d.prop === "animation-iteration-count") &&
          /\binfinite\b/.test(d.value) &&
          !/prefers-reduced-motion/.test(d.at) &&
          !LOOP_ALLOW[d.selector]
      )
      .map(where);
    expect(bad).toEqual([]);
  });

  it("each fog drift has an off switch: no animation unless the fog is live", () => {
    const off = (sel: RegExp) =>
      decls.some(
        (d) =>
          d.prop === "animation" && d.value === "none" && sel.test(d.selector)
      );
    expect(off(/\.nva-fog\[data-live="0"\] \.nva-fog-dots/)).toBe(true);
    expect(off(/\.pk-fog:not\(\[data-pk-live="1"\]\) > \.pk-fog-dots/)).toBe(
      true
    );
  });
});

/* ---------- 4. will-change is a compositor property ---------- */

describe("phone will-change", () => {
  it("names only transform, opacity, clip-path or translate", () => {
    const bad = phoneDecls
      .filter((d) => d.prop === "will-change" && d.value !== "auto")
      .filter(
        (d) =>
          !d.value
            .split(",")
            .every((v) =>
              /^(transform|opacity|clip-path|translate)$/.test(v.trim())
            )
      )
      .map((d) => `${where(d)} ${d.value}`);
    expect(bad).toEqual([]);
  });
});

/* ---------- 5. one live blur while something moves ---------- */

/** Glass that stays live while something moves, or never shares a screen with
 *  a mover, with the reason. */
const BLUR_OWN: Record<string, string> = {
  "pk-scrim-blur": "the mover's own blur: the scrim of a sheet",
  "pk-sheet":
    "a moving sheet keeps its own glass (the scrim is the other half of the pair)",
  "px-glass": "sign-in / setup sky chrome: no mover shares the screen",
  "px-track": "sign-in / setup sky chrome: no mover shares the screen",
  "px-badge": "sign-in / setup sky chrome: no mover shares the screen",
  "px-chip-btn": "sign-in / setup sky chrome: no mover shares the screen",
  "px-dots": "sign-in / setup sky chrome: no mover shares the screen",
};

/** Every class that a "moving" rule strips the backdrop-filter from. */
function strippedClasses(): Set<string> {
  const out = new Set<string>();
  for (const d of decls) {
    if (
      !/^(-webkit-)?backdrop-filter$/.test(d.prop) ||
      !/^none\b/.test(d.value)
    )
      continue;
    if (
      !/(data-nva-moving|data-pk-moving|\.pd-reader\[data-pd-sliding\]|\.nva\[data-moving\]|\[inert\])/.test(
        d.selector
      )
    )
      continue;
    for (const m of d.selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) out.add(m[1]);
  }
  return out;
}

describe("phone glass is known to the moving lists", () => {
  it("every phone class with a backdrop-filter is stripped while a mover moves, or is the mover's own", () => {
    const stripped = strippedClasses();
    const bad: string[] = [];
    for (const d of phoneDecls) {
      if (
        !/^(-webkit-)?backdrop-filter$/.test(d.prop) ||
        /^none\b/.test(d.value)
      )
        continue;
      for (const piece of d.selector.split(",")) {
        const last =
          norm(piece)
            .split(/[\s>+~]+/)
            .pop() ?? "";
        const classes = [...last.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(
          (m) => m[1]
        );
        if (!classes.some((c) => stripped.has(c) || BLUR_OWN[c]))
          bad.push(`${d.file}:${d.line} ${norm(piece)}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

/* ---------- 6. chrome type is 13 / 12 px (rule 2) ---------- */

/** Where a 14 px rule is the body copy of a document, not chrome. */
const FONT14_ALLOW: Record<string, string> = {};

describe("phone chrome type", () => {
  it("has no 14 px chrome left after the overrides", () => {
    const bad: string[] = [];
    for (const d of phoneDecls) {
      let size: string | null = null;
      if (d.prop === "font")
        size =
          d.value.match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\/|\s|$)/)?.[1] ?? null;
      if (d.prop === "font-size")
        size = d.value.match(/^(\d+(?:\.\d+)?)px$/)?.[1] ?? null;
      if (size === null || Math.round(Number(size)) !== 14) continue;
      if (FONT14_ALLOW[d.selector]) continue;
      const fixed = later(d).some(
        (o) => o.prop === "font-size" && /^1[23]px$/.test(o.value)
      );
      if (!fixed) bad.push(where(d));
    }
    expect(bad).toEqual([]);
  });
});

/* ---------- 7. one layer per progressive blur ---------- */

describe("progressive blurs keep one layer", () => {
  it("hides the 4 px and 22 px layers of each band, and all but one of the glass", () => {
    const hidden = (family: string, variant: string) =>
      decls.some(
        (d) =>
          d.prop === "display" &&
          d.value === "none" &&
          d.selector.includes(`.${family}`) &&
          d.selector.includes(`.${variant}`)
      );
    for (const family of ["mau-band-blur", "nva-head-blur", "nva-fog-blur"])
      for (const variant of ["is-1", "is-3"])
        expect([family, variant, hidden(family, variant)]).toEqual([
          family,
          variant,
          true,
        ]);
    for (const variant of ["is-2", "is-3"])
      expect([
        "mau-glass-blur",
        variant,
        hidden("mau-glass-blur", variant),
      ]).toEqual(["mau-glass-blur", variant, true]);
  });
});

/* ---------- 8. the 13 px sweep never beats a more specific vendored size ---------- */

/** Selector list split on the commas outside parentheses. */
function splitTop(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of selector) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(norm(cur));
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(norm(cur));
  return out;
}

/** Specificity as [ids, classes + attributes + pseudo-classes, types]. :is/:not/:has
 *  count as their heaviest argument. */
function specificity(selector: string): [number, number, number] {
  let s = selector.replace(
    /::?[a-z-]+\(([^()]*(\([^()]*\))?[^()]*)\)/g,
    (m, inner: string) => {
      if (/^::?(is|not|has|where)\(/.test(m)) {
        if (m.startsWith(":where(")) return "";
        const best = inner
          .split(",")
          .map((a) => specificity(a.trim()))
          .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])
          .pop() ?? [0, 0, 0];
        return `${"#x".repeat(best[0])}${".x".repeat(best[1])}${"x ".repeat(best[2])}`;
      }
      return ".x";
    }
  );
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  s = s.replace(/#[\w-]+/g, "");
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:[a-z-]+/g) ?? []).length;
  s = s.replace(/\.[\w-]+|\[[^\]]*\]|::?[a-z-]+/g, " ");
  const types = (s.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return [ids, cls, types];
}
const atLeast = (a: number[], b: number[]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

describe("the 13 px override is no more specific than the rule it corrects", () => {
  /** Vendored rules that set a size of their own, more specific than the 14 px one. */
  const KEEP: { selector: string; size: string; classes: string[] }[] = [
    {
      selector: ".needt-v3 .pml-avatar.is-big",
      size: "15px",
      classes: ["pml-avatar", "is-big"],
    },
    {
      selector: ".needt-v3 .ps-plan-terms",
      size: "12px",
      classes: ["ps-plan-terms"],
    },
    {
      selector: ".needt-v3 .mbm-media-12.is-big .mbm-media-13",
      size: "19px",
      classes: ["mbm-media-13"],
    },
  ];
  const sweep = decls.filter(
    (d) =>
      d.file === "v3-overrides/phone-perf.css" &&
      d.prop === "font-size" &&
      d.value === "13px"
  );

  for (const k of KEEP) {
    it(`${k.selector} keeps ${k.size}`, () => {
      const vendored = decls.find(
        (d) =>
          d.selector === k.selector &&
          /font/.test(d.prop) &&
          d.value.includes(k.size.replace("px", "px"))
      );
      expect(vendored).toBeDefined();
      const spec = specificity(k.selector);
      const beats: string[] = [];
      for (const d of sweep) {
        for (const piece of splitTop(d.selector)) {
          const named = [...piece.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
          if (!named.some((c) => k.classes.includes(c))) continue;
          if (atLeast(specificity(piece), spec)) beats.push(piece);
        }
      }
      expect(beats).toEqual([]);
    });
  }

  it("the specificity helper counts what it should", () => {
    expect(specificity(".needt-v3 .pml-avatar.is-big")).toEqual([0, 3, 0]);
    expect(specificity(".needt-v3 :is(.a, .b.c.d)")).toEqual([0, 4, 0]);
    expect(specificity(".needt-v3 .x:not(.y) > button")).toEqual([0, 3, 1]);
  });
});
