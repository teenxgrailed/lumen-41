/**
 * What the design-system guard looks for in a stylesheet (ds-guard.test.ts).
 * Four things the system exists to stop: a box-shadow with a colour of its
 * own, a new button / chip / switch / segmented class, a 14px font size, and a
 * grey that is not on the ladder. Each is counted per file;
 * ds-guard-allowlist.json holds today's counts and may only shrink.
 */
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

export interface Findings {
  /** box-shadow declarations that carry a colour literal. */
  shadow: number;
  /** font-size / font declarations with a 14px size. */
  font14: number;
  /** grey colour literals (rgba / hex) that are not a ladder step. */
  grey: number;
  /** class names ending in -btn, -chip, -switch or -seg. */
  classes: string[];
}

/** Text 100 / 85 / 70 / 55 / 40 / 25 and fills 2 / 3 / 4 / 6 / 8 / 12 (PORT.md rule 1). */
export const LADDER_ALPHAS = [
  1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12,
];

const COMPONENT_CLASS = /-(btn|chip|switch|seg)$/;
const COLOUR_LITERAL =
  /\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\bcolor\(|#[0-9a-f]{3,8}\b|\b(?:white|black)\b/i;
const COLOUR_TOKEN =
  /rgba?\(([^)]*)\)|#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi;
/** Properties whose colour is a shadow: counted by the shadow rule, not as a grey. */
const SHADOW_PROPS =
  /^(-webkit-)?(box-shadow|text-shadow|filter|backdrop-filter)$/;

/** `value` with every var(...) removed, nested parentheses and fallbacks included. */
export function stripVars(value: string): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("var(", i)) {
      let depth = 0;
      let j = i + 3;
      for (; j < value.length; j++) {
        if (value[j] === "(") depth++;
        else if (value[j] === ")" && --depth === 0) break;
      }
      i = j + 1;
      out += " ";
    } else out += value[i++];
  }
  return out;
}

/** A box-shadow is literal when anything outside var() is a colour. */
export function isLiteralShadow(value: string): boolean {
  return COLOUR_LITERAL.test(stripVars(value));
}

function channel(token: string): number {
  return token.endsWith("%")
    ? (parseFloat(token) / 100) * 255
    : parseFloat(token);
}

/** The off-ladder grey literals in a value (an rgba / rgb / hex that is neutral). */
export function offLadderGreys(value: string): string[] {
  const found: string[] = [];
  // the ink as a token at an alpha of its own: rgba(var(--foreground-rgb), .5)
  for (const match of value.matchAll(
    /rgba?\(\s*var\(--(?:foreground|ink|text)[\w-]*rgb[\w-]*\)\s*[,/]\s*([0-9.]+%?)\s*\)/gi
  )) {
    const alpha = match[1].endsWith("%")
      ? parseFloat(match[1]) / 100
      : parseFloat(match[1]);
    if (!LADDER_ALPHAS.some((a) => Math.abs(a - alpha) < 0.006))
      found.push(match[0]);
  }
  for (const match of stripVars(value).matchAll(COLOUR_TOKEN)) {
    let r: number;
    let g: number;
    let b: number;
    let alpha = 1;
    if (match[1] !== undefined) {
      const parts = match[1]
        .trim()
        .split(/[\s,/]+/)
        .filter(Boolean);
      if (parts.length < 3) continue;
      [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])];
      if (parts[3] !== undefined)
        alpha = parts[3].endsWith("%")
          ? parseFloat(parts[3]) / 100
          : parseFloat(parts[3]);
    } else {
      let hex = match[2];
      if (hex.length <= 4)
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) alpha = parseInt(hex.slice(6, 8), 16) / 255;
    }
    if (![r, g, b, alpha].every(Number.isFinite)) continue;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 12) continue; // a hue, not a grey
    const onLadder = LADDER_ALPHAS.some((a) => Math.abs(a - alpha) < 0.006);
    const pure =
      (r <= 1 && g <= 1 && b <= 1) || (r >= 254 && g >= 254 && b >= 254);
    if (alpha >= 0.994) {
      // an opaque grey: only pure white and pure black are not "a grey"
      if (!pure) found.push(match[0]);
    } else if (!onLadder) found.push(match[0]);
  }
  return found;
}

/** Everything the guard counts in one stylesheet's text. */
export function scanCss(css: string, from = "inline.css"): Findings {
  const root = postcss.parse(css, { from });
  const findings: Findings = { shadow: 0, font14: 0, grey: 0, classes: [] };
  const classes = new Set<string>();

  root.walkRules((rule) => {
    try {
      selectorParser((selectors) => {
        selectors.walkClasses((node) => {
          if (COMPONENT_CLASS.test(node.value)) classes.add(node.value);
        });
      }).processSync(rule.selector);
    } catch {
      /* a selector the parser does not know is not a class declaration */
    }
  });

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const value = decl.value;
    if (prop === "box-shadow" || prop === "-webkit-box-shadow") {
      if (isLiteralShadow(value)) findings.shadow++;
      return;
    }
    if (prop === "font-size" || prop === "font") {
      if (/(^|[\s/])14px\b|\b0?\.875rem\b/.test(stripVars(value)))
        findings.font14++;
    }
    if (!SHADOW_PROPS.test(prop)) findings.grey += offLadderGreys(value).length;
  });

  findings.classes = [...classes].sort();
  return findings;
}
