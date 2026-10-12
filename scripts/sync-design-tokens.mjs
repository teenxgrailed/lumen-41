#!/usr/bin/env node

/**
 * Re-vendor the design tokens from a downloaded Claude Design bundle.
 *
 *   npm run tokens:sync            # bundle at the repo root
 *   npm run tokens:sync -- <path>  # bundle somewhere else
 *
 * Why this is a script and not a copy: the bundle gets re-downloaded every time
 * the design changes, so any hand edit to the vendored output becomes an
 * unmergeable conflict on the next download. Everything the port needs to change
 * about these files is expressed here, once.
 *
 * WHAT IT REWRITES, AND WHY IT MUST
 *
 * The design system declares its tokens on `:root`, `.dark` and `.dim` — the
 * same selectors this repository already uses. Nine names collide, and four of
 * them are fatal rather than merely confusing:
 *
 *     --background  --foreground  --border  --destructive
 *
 * Tailwind consumes those four as HSL triplets, `hsl(var(--background))`. The
 * design system puts a hex in them. `hsl(#fcfdfe)` is invalid, so the
 * declaration is dropped and the element paints transparent — silently, with no
 * console error, in one theme at a time. That would take out 194 shadcn utility
 * usages across 43 files.
 *
 * So the vendored tokens are scoped under `.needt-v2` instead of landing on the
 * document root. Inside that subtree the new design is authoritative; outside
 * it, the existing app is untouched. When every screen is ported the scope is
 * removed in one commit and the shadcn block goes with it.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/*
 * Arguments: `[bundle] [--scope .needt-v3] [--out src/styles/v3]`.
 * Without --scope this is the September `.needt-v2` vendoring, unchanged.
 * With `--scope .needt-v3` it is the design v3 port (see `syncV3` below).
 */
const ARGS = (() => {
  const out = { positional: [], scope: null, out: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--scope") out.scope = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else out.positional.push(argv[i]);
  }
  return out;
})();

const BUNDLE =
  ARGS.positional[0] || join(ROOT, "Content height and label fixes");
const SCOPE = ".needt-v2";

/** Token files, in the order the design system's own styles.css imports them. */
const ORDER = [
  "fonts",
  "colors",
  "typography",
  "spacing",
  "radius",
  "elevation",
  "motion",
  "zindex",
  "base",
  "components",
  "ui",
];

/** Theme scopes. A theme is a data attribute so one switch drives every token. */
const THEME = {
  ":root": SCOPE,
  ".dark": `${SCOPE}[data-theme="dark"]`,
  ".dim": `${SCOPE}[data-theme="dim"]`,
  ".paper": `${SCOPE}[data-theme="paper"]`,
  ".warm": `${SCOPE}[data-theme="warm"]`,
  ".drift": `${SCOPE}[data-drift="on"]`,
  ".drift.theme-drifts": `${SCOPE}[data-drift="on"] .theme-drifts`,
  '.drift[data-drift-quiet="1"]': `${SCOPE}[data-drift="on"][data-drift-quiet="1"]`,
};

/**
 * Rewrite one selector list. Handles the grouped form (`.dark, .dim`) and
 * anything the map does not know by prefixing it with the scope, so component
 * rules like `.rb-entry` and pseudo-element rules like `::selection` stay inside
 * the subtree instead of leaking onto the whole document.
 */
function rescope(selectorList) {
  return selectorList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (THEME[s]) return THEME[s];
      // html/body carry document-level declarations. Nested under the scope
      // they would match nothing, so they collapse onto the scope element.
      // The prototype put the theme in a class on its root and wrote
      // descendant selectors like `.dark .key-cap`. This repository puts the
      // theme in a data attribute ON the scope element, so a descendant form
      // can never match and the rule is silently dead — dark key-caps lose
      // their bevel inversion with no error anywhere.
      const descendantTheme = s.match(/^\.(dark|dim|paper|warm)\s+(.+)$/);
      if (descendantTheme) {
        return `${SCOPE}[data-theme="${descendantTheme[1]}"] ${descendantTheme[2]}`;
      }
      if (s === "html" || s === "body") return SCOPE;
      if (s.startsWith("html[") || s.startsWith("body["))
        return SCOPE + s.slice(4);
      if (s.startsWith(".drift"))
        return `${SCOPE}[data-drift="on"]${s.slice(6)}`;
      if (s.startsWith("::")) return `${SCOPE} ${s}`; // ::selection, ::placeholder
      if (s.startsWith(":root")) return s.replace(":root", SCOPE);
      return `${SCOPE} ${s}`; // .rb-entry, .scroll-inner, …
    })
    .join(",\n");
}

/**
 * Rewrite every selector in a stylesheet, including rules nested inside an
 * at-rule. At-rules themselves and keyframe steps pass through untouched: they
 * are not selectors, and scoping them produces CSS that silently does nothing.
 */
function scopeSheet(css, rescopeList = rescope) {
  // Two things are masked before the selector pass, because a regex over raw
  // CSS reads both of them as selector lists.
  //
  // Comments, because one can contain commas, braces and the word ":root".
  //
  // @keyframes blocks, because a keyframe step list like `0%, 100% {` is not a
  // selector and scoping it produces `.needt-v2 0%, .needt-v2 100%`, which is
  // invalid — the frame is dropped and the animation silently interpolates from
  // whatever survived. Guarding a single `0%` is not enough; the comma-separated
  // form is the common one.
  const masked = [];
  const stash = (text) => {
    masked.push(text);
    return `\u0000${masked.length - 1}\u0000`;
  };

  let work = css.replace(/\/\*[\s\S]*?\*\//g, stash);

  // Brace-counted so a nested block inside a keyframe cannot end it early.
  work = (() => {
    let out = "";
    let i = 0;
    const AT = /@(-\w+-)?keyframes\b/g;
    for (;;) {
      AT.lastIndex = i;
      const found = AT.exec(work);
      if (!found) return out + work.slice(i);
      const open = work.indexOf("{", found.index);
      if (open === -1) return out + work.slice(i);
      let depth = 0;
      let end = open;
      for (; end < work.length; end += 1) {
        if (work[end] === "{") depth += 1;
        else if (work[end] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out +=
        work.slice(i, found.index) + stash(work.slice(found.index, end + 1));
      i = end + 1;
    }
  })();

  const PLACEHOLDER = /\u0000(\d+)\u0000/g;

  const scoped = work.replace(
    /(^|[{};])([^{}@]*?)\{/gm,
    (match, boundary, selectors) => {
      const marks = [...selectors.matchAll(PLACEHOLDER)];
      const last = marks[marks.length - 1];
      const head = last ? selectors.slice(0, last.index + last[0].length) : "";
      const tail = selectors.slice(head.length);
      const trimmed = tail.trim();

      if (!trimmed) return match;
      if (trimmed.startsWith("@")) return match;

      const indent = tail.match(/^\s*/)[0];
      return `${boundary}${head}${indent}${rescopeList(trimmed)} {`;
    }
  );

  // Restore innermost-first: a masked keyframe block can contain masked comments.
  let restored = scoped;
  for (let pass = 0; pass < 4 && /\u0000\d+\u0000/.test(restored); pass += 1) {
    restored = restored.replace(
      PLACEHOLDER,
      (_, index) => masked[Number(index)]
    );
  }
  return restored;
}

/**
 * Strip @font-face blocks that point at a file we do not ship.
 *
 * `exposure-wordmark.css` declares the 205TF Exposure variable font from a
 * relative .woff2 next to itself in the bundle. That file is a TRIAL: testing
 * only, no commercial use, no redistribution, and .gitignore keeps every .woff2
 * under the bundle out of the repository. Vendoring the rule verbatim therefore
 * points the bundler at a path that does not exist and takes down the whole
 * stylesheet — every screen, not just the wordmark.
 *
 * The animation stays; only the face is removed. When the web licence is bought
 * from 205TF, self-host the file and add a single @font-face by hand in
 * globals.css rather than teaching this script to emit one.
 */
function stripFontFaces(css, label) {
  let removed = 0;
  const out = css.replace(/@font-face\s*\{[^}]*\}/g, () => {
    removed += 1;
    return "";
  });
  if (!removed) return css;
  return (
    `/* ${removed} @font-face rule(s) removed from ${label}: they load the ` +
    `Exposure TRIAL font, which is not redistributable and is not in the repo. */\n` +
    out
  );
}

/**
 * The captured prototype contains one stray dot-and-comment-terminator suffix
 * before the compact timeline-title rule. Browsers ignore the damaged selector in development,
 * but Next's production CSS minimizer correctly rejects it. Remove only that
 * known capture artifact before scoping; the vendored output stays generated.
 */
function stripCaptureArtifacts(css) {
  return css.replace(/}\.[ \t]+\*\/(?=\s*\.nt-block\[data-compact=)/g, "}");
}

/**
 * Drop every stylesheet @import that reaches the Google Fonts CDN.
 *
 * The design system's `tokens/fonts.css` loads Inter, Instrument Serif and
 * JetBrains Mono from fonts.googleapis.com, which hands every visitor's IP
 * address to Google on each page load. The three families are self-hosted
 * instead: the woff2 files live in public/fonts/ds/ and their @font-face rules
 * in src/styles/needt-fonts.css, under the same family names the tokens use.
 * Without this pass the next sync would quietly put the CDN back.
 */
const GOOGLE_FONTS_IMPORT =
  /@import\s+url\(\s*["']?https:\/\/fonts\.googleapis\.com\/[^)]*\)\s*;/g;

function stripGoogleFontImports(css, label) {
  return css.replace(
    GOOGLE_FONTS_IMPORT,
    `/* Google Fonts @import removed from ${label} by tokens:sync — the families ` +
      `are self-hosted in src/styles/needt-fonts.css. */`
  );
}

function header(lines) {
  return [
    "/* " + "=".repeat(72),
    ...lines.map((l) => "   " + l),
    "   " + "=".repeat(72) + " */",
    "",
  ].join("\n");
}

/* ==========================================================================
 * DESIGN V3 (`--scope .needt-v3 --out src/styles/v3`)
 *
 *   npm run tokens:sync:v3                      # frozen copy in docs/port
 *   npm run tokens:sync:v3 -- "<bundle path>"   # a fresh download
 *
 * Source: either the frozen, committed copy (`docs/port/prototype` +
 * `docs/port/_ds`, the default, so the output is reproducible from the repo)
 * or a downloaded "Needt - Design : App, Landing" bundle (`needt-app/` +
 * `_ds/<id>/`). Every prototype stylesheet becomes one file under the out
 * directory, rescoped under `.needt-v3`, plus `index.css` importing the
 * desktop set in the prototype's own <link> order.
 *
 * How the prototype themes, and what that becomes:
 *   - It puts the theme as a class on BOTH <html> and the `.app` div
 *     (`paper` = light, `dark`, legacy `dim`/`warm`), plus `theme-time` while
 *     Time is chosen, and `data-accent` on <html>.
 *   - Here one element carries all of it: the `.needt-v3` scope element, with
 *     `data-theme="light|dark"`, `data-drift="on"` for Time, `data-accent`,
 *     and the classes `theme-surface theme-drifts`.
 *   - So every theme mark in a selector's first compound moves onto the scope
 *     (`.app.dark` → `.needt-v3[data-theme="dark"] .app`), and a second
 *     compound made only of theme marks merges into it too
 *     (`[data-accent="blue"] :is(.paper, .warm)` → one scope compound).
 *     `html`/`body`/`:root` compounds collapse onto the scope.
 *   - A nested `.needt-v3` element (a theme miniature) re-themes its subtree.
 * ========================================================================== */
const V3_SCOPE = ARGS.scope || ".needt-v3";

/** Theme class → the attribute selector it becomes on the scope element. */
const V3_THEME_TOKENS = {
  ".paper": ':is([data-theme="light"], [data-theme="paper"])',
  ".dark": '[data-theme="dark"]',
  ".dim": '[data-theme="dim"]',
  ".warm": '[data-theme="warm"]',
  ".drift": '[data-drift="on"]',
  ".theme-time": '[data-drift="on"]',
};

/** The desktop stylesheets index-dev.html links, in its order. */
const V3_DESKTOP_ORDER = [
  "ds-tokens",
  "exposure-wordmark",
  "themes",
  "composer",
  "app",
  "base",
  "shell",
  "focus",
  "settings",
  "chat",
  "docs",
  "places",
  "connections",
  "scenes",
  "paywall",
  "auth",
  "tasks",
  "home",
  "calendar",
  "mail",
  "habits",
];

/**
 * The phone stylesheets mobile-dev.html links after the desktop set, in its
 * order. They are imported here, inside index.css, so they load before the
 * hand-written overrides (v3-overrides/*.css) and an override wins over a
 * vendored rule at equal specificity. (mobile.css, which mobile-dev.html loads
 * after base, follows the desktop set here.)
 */
const V3_PHONE_ORDER = [
  "mobile",
  "mobile-onboarding",
  "mobile-nav",
  "nav-a",
  "phone-kit",
  "phone-overlays",
  "phone-tasks",
  "phone-drag",
  "phone-docs",
  "phone-mail",
  "phone-habits",
  "phone-places",
  "phone-settings",
  "mobile-v2-plates",
];

/** Split on a top-level delimiter, ignoring ones inside (), [] and quotes. */
function splitTopLevel(text, isDelim) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && isDelim(ch, i)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** `a > b c` → [{ comb: "", sel: "a" }, { comb: ">", sel: "b" }, { comb: " ", sel: "c" }]. */
function splitCompounds(selector) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  let comb = "";
  const flush = () => {
    if (cur) out.push({ comb: out.length ? comb || " " : "", sel: cur });
    cur = "";
    comb = "";
  };
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") cur += selector[++i] ?? "";
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && (ch === ">" || ch === "+" || ch === "~")) {
      if (cur) flush();
      comb = ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

/** One compound → simple selectors (`.a[b]:is(.c, .d)::e` → 4 tokens). */
function splitSimple(compound) {
  const tokens = [];
  const re =
    /(::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|\*|[\w-]+)/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(compound))) {
    if (m.index !== consumed) return null; // something we do not understand
    tokens.push(m[0]);
    consumed = m.index + m[0].length;
  }
  return consumed === compound.length ? tokens : null;
}

/** `:is(.dark, .dim)` → `:is([data-theme="dark"], [data-theme="dim"])`, else null. */
function themeToken(token) {
  if (V3_THEME_TOKENS[token]) return V3_THEME_TOKENS[token];
  const is = token.match(/^:(is|where)\((.*)\)$/);
  if (!is) return null;
  const items = splitTopLevel(is[2], (ch) => ch === ",").map((s) => s.trim());
  if (!items.length || !items.every((s) => V3_THEME_TOKENS[s])) return null;
  return `:${is[1]}(${items.map((s) => V3_THEME_TOKENS[s]).join(", ")})`;
}

const ROOT_ELEMENT = new Set([":root", "html", "body"]);

function rescopeV3Selector(selector) {
  const compounds = splitCompounds(selector.trim());
  if (!compounds.length) return selector;
  const first = splitSimple(compounds[0].sel);
  if (!first) return `${V3_SCOPE} ${selector.trim()}`;

  let scope = V3_SCOPE;
  let rootPseudo = ""; // ::view-transition-* lives on the document root
  const keep = [];
  const isRoot = ROOT_ELEMENT.has(first[0]);

  for (const token of first) {
    if (ROOT_ELEMENT.has(token)) continue;
    const theme = themeToken(token);
    if (theme) {
      scope += theme;
      continue;
    }
    if (isRoot && token.startsWith("::view-transition")) {
      rootPseudo += token;
      continue;
    }
    if (isRoot) {
      scope += token;
      continue;
    } // html.is-drag-active, :root[data-dt-ambient]
    keep.push(token);
  }

  // A lone [data-accent] in the first compound is the root's accent.
  if (
    !isRoot &&
    keep.length &&
    keep.every((t) => /^\[data-accent[\]=]/.test(t))
  ) {
    scope += keep.join("");
    keep.length = 0;
  }

  let rest = compounds.slice(1);
  // `[data-accent="x"] :is(.paper, .warm)`: the second compound is the
  // prototype's `.app` repeating the theme. On one scope element it merges.
  if (!keep.length && rest.length && rest[0].comb === " ") {
    const second = splitSimple(rest[0].sel);
    if (second && second.every((t) => themeToken(t))) {
      scope += second.map(themeToken).join("");
      rest = rest.slice(1);
    }
  }

  if (rootPseudo) {
    return `:root:has(${scope})${rootPseudo}`;
  }

  let out = scope;
  if (keep.length) out += " " + keep.join("");
  for (const c of rest) out += (c.comb === " " ? " " : ` ${c.comb} `) + c.sel;
  return out;
}

function rescopeV3(selectorList) {
  return splitTopLevel(selectorList, (ch) => ch === ",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(rescopeV3Selector)
    .join(",\n");
}

/**
 * The display face. The prototype loads the Exposure TRIAL file by family
 * name; the app loads the licensed `public/fonts/ExposureVAR.woff2` through
 * next/font (`src/lib/needt3/fonts.ts`), which exposes it as a CSS variable.
 * The @font-face is stripped (stripFontFaces) and the family name rewritten.
 */
function rewriteFontFamilies(css) {
  return css.replace(/(["'])Exposure VAR\1/g, "var(--font-v3-exposure)");
}

/**
 * The design system's fonts.css @imports Google Fonts (Inter, Instrument
 * Serif, JetBrains Mono). The v2 vendoring already imports that exact URL
 * from globals.css, and an @import that is not first in the bundle is
 * dropped anyway, so the v3 copy leaves it out.
 * //todo contract step: when .needt-v2 is deleted, load these three through
 * next/font in src/lib/needt3/fonts.ts instead of the CDN import.
 */
function stripRemoteImports(css) {
  return css.replace(
    /@import\s+url\(["']?https?:[^)]*\)\s*;?/g,
    "/* remote @import removed by sync-design-tokens (v3); see the script */"
  );
}

/**
 * Known damage in the frozen copy, fixed before parsing:
 * - styles/mobile.css lost the `/*` that opens the doc-reader comment, so the
 *   comment text reads as a selector and the rest of the file is garbage.
 * - app.css carries the same stray dot-and-terminator suffix the v2 capture had (see
 *   stripCaptureArtifacts): browsers skip it, Next's CSS minimizer fails the
 *   production build on it.
 */
function stripV3CaptureArtifacts(css, name) {
  css = stripCaptureArtifacts(css);
  if (name === "mobile") {
    return css.replace(
      /(\.iosf-keyboard-11 \{[^}]*\})([ \t]+doc-style\.jsx \(backdrop)/,
      "$1\n/* The doc reader:$2"
    );
  }
  return css;
}

/**
 * @keyframes are global: a selector scope does not reach them. 46 of the
 * prototype's names are also defined by the v2 layer (needt-motion.css,
 * globals.css), so vendoring them verbatim would replace the old screens'
 * animations whenever the v3 CSS loads. Every v3 keyframe is renamed
 * `v3-<name>`, with its uses in `animation`, `animation-name` and custom
 * properties. A component that names a keyframe in inline style must use the
 * `v3-` name.
 */
const V3_KEYFRAME_PREFIX = "v3-";

function collectKeyframes(css) {
  return [...css.matchAll(/@(?:-\w+-)?keyframes\s+([\w-]+)/g)].map((m) => m[1]);
}

function renameKeyframes(css, names) {
  if (!names.size) return css;
  const renameValue = (value) =>
    value.replace(/(^|[\s,(])([\w-]+)(?=$|[\s,)])/g, (all, lead, word) =>
      names.has(word) ? `${lead}${V3_KEYFRAME_PREFIX}${word}` : all
    );
  return css
    .replace(/@((?:-\w+-)?keyframes)\s+([\w-]+)/g, (all, kw, name) =>
      names.has(name) ? `@${kw} ${V3_KEYFRAME_PREFIX}${name}` : all
    )
    .replace(
      /(^|[;{\s])(animation(?:-name)?|--[\w-]+)(\s*:)([^;{}]*)/g,
      (all, lead, prop, colon, value) =>
        `${lead}${prop}${colon}${renameValue(value)}`
    );
}

function syncV3() {
  const bundle = ARGS.positional[0]
    ? join(ARGS.positional[0])
    : join(ROOT, "docs", "port");
  const appDir = existsSync(join(bundle, "needt-app"))
    ? join(bundle, "needt-app")
    : join(bundle, "prototype");
  const dsRoot = join(bundle, "_ds");
  const dsDirV3 = existsSync(join(dsRoot, "tokens"))
    ? dsRoot
    : existsSync(dsRoot)
      ? readdirSync(dsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => join(dsRoot, e.name))
          .find((d) => existsSync(join(d, "tokens")))
      : null;
  if (!existsSync(join(appDir, "themes.css")) || !dsDirV3) {
    console.error(`No prototype (themes.css) or _ds/tokens under ${bundle}.`);
    process.exit(1);
  }

  const outDir = join(ROOT, ARGS.out || join("src", "styles", "v3"));
  mkdirSync(outDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const source = bundle.startsWith(ROOT)
    ? bundle.slice(ROOT.length + 1)
    : basename(bundle);
  const banner = (what) =>
    header([
      `Needt design v3 — ${what} — VENDORED, DO NOT EDIT BY HAND.`,
      `Generated from ${source} on ${day}; scoped under ${V3_SCOPE}.`,
      "Regenerate with: npm run tokens:sync:v3",
    ]);
  const prepare = (css, name) =>
    scopeSheet(
      rewriteFontFamilies(
        stripRemoteImports(
          stripFontFaces(stripV3CaptureArtifacts(css, name), `${name}.css`)
        )
      ),
      rescopeV3
    );

  const sheets = new Map();
  const write = (name, body) => sheets.set(name, body);

  let tokens = banner("design-system tokens");
  for (const name of ORDER) {
    const file = join(dsDirV3, "tokens", `${name}.css`);
    if (!existsSync(file)) continue;
    tokens += `/* ---------- tokens/${name}.css ---------- */\n`;
    tokens += prepare(readFileSync(file, "utf8"), name) + "\n";
  }
  write("ds-tokens", tokens);

  for (const name of ["themes", "app", "composer", "exposure-wordmark"]) {
    const file = join(appDir, `${name}.css`);
    if (!existsSync(file)) continue;
    write(
      name,
      banner(`${name}.css`) + prepare(readFileSync(file, "utf8"), name)
    );
  }

  const stylesDir = join(appDir, "styles");
  for (const entry of readdirSync(stylesDir)
    .filter((f) => f.endsWith(".css"))
    .sort()) {
    const name = entry.replace(/\.css$/, "");
    write(
      name,
      banner(`styles/${entry}`) +
        prepare(readFileSync(join(stylesDir, entry), "utf8"), name)
    );
  }

  const keyframes = new Set([...sheets.values()].flatMap(collectKeyframes));
  for (const [name, body] of sheets) {
    writeFileSync(
      join(outDir, `${name}.css`),
      renameKeyframes(body, keyframes)
    );
  }
  const written = [...sheets.keys()];

  const index = [
    header([
      "Needt design v3 — the desktop stylesheets in the prototype's order,",
      "then the phone stylesheets in mobile-dev.html's order.",
      "VENDORED, DO NOT EDIT BY HAND. Regenerate with: npm run tokens:sync:v3",
    ]),
    ...V3_DESKTOP_ORDER.filter((n) => written.includes(n)).map(
      (n) => `@import "./${n}.css";`
    ),
    "",
    "/* Phone */",
    ...V3_PHONE_ORDER.filter((n) => written.includes(n)).map(
      (n) => `@import "./${n}.css";`
    ),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "index.css"), index);

  console.log(
    `Vendored ${written.length} stylesheets under ${V3_SCOPE} into ${outDir}.`
  );
}

if (ARGS.scope) {
  if (ARGS.scope !== ".needt-v3") {
    console.error(
      `Unknown scope ${ARGS.scope}; the v3 pipeline writes .needt-v3 only.`
    );
    process.exit(1);
  }
  syncV3();
  process.exit(0);
}

const dsDir = existsSync(join(BUNDLE, "_ds"))
  ? readdirSync(join(BUNDLE, "_ds"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(BUNDLE, "_ds", e.name))[0]
  : null;

if (!dsDir || !existsSync(join(dsDir, "tokens"))) {
  console.error(
    `No token directory under ${BUNDLE}/_ds — is the bundle unpacked?`
  );
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 10);
const outDir = join(ROOT, "src", "styles");
mkdirSync(outDir, { recursive: true });

/* ---- tokens -------------------------------------------------------------- */
let tokens = header([
  "Needt design-system tokens — VENDORED, DO NOT EDIT BY HAND.",
  `Generated from ${basename(dsDir)}/tokens/ on ${stamp}.`,
  "Regenerate with: npm run tokens:sync",
  "",
  `Scoped under ${SCOPE}: the design system declares on :root/.dark/.dim, which`,
  "collide with the shadcn HSL triplets Tailwind reads. See the script header.",
  "",
  "Every derived token is repeated verbatim inside each theme scope. That is",
  "deliberate: a custom property whose value contains var() is substituted where",
  "it is DECLARED, so a ladder declared once on the root keeps the light",
  "foreground even in dark. Change an alpha in one block, change it in all.",
]);

for (const name of ORDER) {
  const file = join(dsDir, "tokens", `${name}.css`);
  if (!existsSync(file)) continue;
  tokens += `/* ---------- tokens/${name}.css ---------- */\n`;
  tokens +=
    scopeSheet(
      stripGoogleFontImports(readFileSync(file, "utf8"), `tokens/${name}.css`)
    ) + "\n";
}
writeFileSync(join(outDir, "needt-ds-tokens.css"), tokens);

/* ---- themes -------------------------------------------------------------- */
const themesSrc = join(BUNDLE, "needt-app", "themes.css");
let themes = header([
  "Needt themes — VENDORED, DO NOT EDIT BY HAND.",
  `Generated from needt-app/themes.css on ${stamp}.`,
  "Regenerate with: npm run tokens:sync",
  "",
  "Holds the two themes the design system does not ship (paper, warm), the",
  "orthogonal drift layer, the dark-ground --shadow-raised override, and shared",
  "object CSS that must not be duplicated per shell.",
]);
themes += scopeSheet(readFileSync(themesSrc, "utf8"));
writeFileSync(join(outDir, "needt-themes.css"), themes);

/* ---- the living motion layer ------------------------------------------- */
/*
 * The prototype keeps its animation in a single <style> block inside
 * index.html, applied through the design system's own class names so it reaches
 * every screen without touching a component. Vendoring it verbatim is the only
 * way the ported screens arrive with the motion they were designed with;
 * rebuilding it from a description loses the timings, and the timings are the
 * design. 33 keyframe sets, and the reduced-motion blocks come with them.
 *
 * Consequence for the port: a component must carry the same class names the
 * design system uses, or this layer lands on nothing.
 */
const indexHtml = readFileSync(join(BUNDLE, "needt-app", "index.html"), "utf8");
const styleBlocks = [
  ...indexHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
].map((m) => m[1]);

let motion = header([
  "Needt motion layer — VENDORED, DO NOT EDIT BY HAND.",
  `Extracted from needt-app/index.html on ${stamp}.`,
  "Regenerate with: npm run tokens:sync",
  "",
  "The prototype's living layer: entrance, landing, menu cascade, the close",
  "tick, the active nav row, and the one breathing rate shared by the wordmark,",
  "the focus aura and the composer glow. All of it off under",
  "prefers-reduced-motion, which is part of what is vendored.",
]);
for (const block of styleBlocks) {
  motion +=
    scopeSheet(stripCaptureArtifacts(stripFontFaces(block, "index.html"))) +
    "\n";
}

/* Component stylesheets that belong with the components rather than the kit. */
for (const name of ["composer", "exposure-wordmark"]) {
  const file = join(BUNDLE, "needt-app", `${name}.css`);
  if (!existsSync(file)) continue;
  motion += `/* ---------- ${name}.css ---------- */\n`;
  motion +=
    scopeSheet(stripFontFaces(readFileSync(file, "utf8"), `${name}.css`)) +
    "\n";
}
writeFileSync(join(outDir, "needt-motion.css"), motion);

const count = (tokens + themes).match(/^\s*--[a-z0-9-]+\s*:/gim)?.length ?? 0;
console.log(`Vendored ${count} tokens, scoped under ${SCOPE}.`);
console.log(`  ${join(outDir, "needt-ds-tokens.css")}`);
console.log(`  ${join(outDir, "needt-themes.css")}`);
console.log(`  ${join(outDir, "needt-motion.css")}`);
