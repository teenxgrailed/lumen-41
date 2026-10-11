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
const BUNDLE = process.argv[2] || join(ROOT, "Content height and label fixes");
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
function scopeSheet(css) {
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
      return `${boundary}${head}${indent}${rescope(trimmed)} {`;
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
