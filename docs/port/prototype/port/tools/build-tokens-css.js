#!/usr/bin/env node
/* build-tokens-css.js — port/tokens/tokens.json → CSS custom properties.
 *
 *   node port/tools/build-tokens-css.js [tokens.json] [out.css]
 *
 * Every token carries $extensions["app.needt"] = { css: "--name", modes: { <mode>: "<css value>" } }.
 * A mode becomes one scope, emitted in cascade order:
 *   light → :root, .paper        dark → .dark          warm → .warm        dim → .dim (legacy previews)
 *   accent:<id>:light → [data-accent="<id>"]
 *   accent:<id>:dark  → [data-accent="<id>"].dark, [data-accent="<id>"] .dark, .dark [data-accent="<id>"]
 *   font-inter → html[data-font="inter"]       reduced-motion → @media (prefers-reduced-motion: reduce) :root
 * A token is written into every scope it was declared in, even with the same value: a value that
 * contains var() is computed where it is declared, so a theme scope must re-declare the ladder
 * (see themes.css header). Accent presets (accent.preset.*) and motion.curve / motion.scale are
 * reference entries with no CSS of their own (their values already sit in the tokens' modes).
 * extract-tokens.js calls buildCss() and re-parses the result to prove the round trip.
 */
"use strict";
const fs = require("fs");
const path = require("path");

function collect(node, out) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$") || !v || typeof v !== "object") continue;
    if ("$value" in v) {
      const x = v.$extensions && v.$extensions["app.needt"];
      if (x && x.css && x.modes && !x.presetOf) out.push(x);
    } else collect(v, out);
  }
  return out;
}

function scopeOf(mode) {
  let m;
  if (mode === "light") return ":root,\n.paper";
  if (mode === "dark") return ".dark";
  if (mode === "warm") return ".warm";
  if (mode === "dim") return ".dim";
  if (mode === "font-inter") return 'html[data-font="inter"]';
  if ((m = mode.match(/^accent:([a-z]+):light$/))) return `[data-accent="${m[1]}"]`;
  if ((m = mode.match(/^accent:([a-z]+):dark$/))) return `[data-accent="${m[1]}"].dark,\n[data-accent="${m[1]}"] .dark,\n.dark [data-accent="${m[1]}"]`;
  return null;
}
function order(mode) {
  if (mode === "light") return 0;
  if (mode === "warm") return 1;
  if (mode === "dark") return 2;
  if (mode === "dim") return 3;
  if (mode.startsWith("accent:")) return 4;
  if (mode === "font-inter") return 5;
  return 6;
}

function buildCss(tree) {
  const toks = collect(tree, []);
  const modes = {};
  for (const t of toks) for (const [m, v] of Object.entries(t.modes)) (modes[m] = modes[m] || []).push([t.css, v]);
  const keys = Object.keys(modes).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const out = ["/* tokens.css — GENERATED from port/tokens/tokens.json by port/tools/build-tokens-css.js. Do not edit. */", ""];
  const media = [];
  for (const m of keys) {
    const body = modes[m].sort((a, b) => a[0].localeCompare(b[0])).map(([n, v]) => `  ${n}: ${v};`).join("\n");
    if (m === "reduced-motion") media.push(`  :root {\n${body.replace(/^/gm, "  ")}\n  }`);
    else if (m === "reduced-motion:dark") media.push(`  .dark {\n${body.replace(/^/gm, "  ")}\n  }`);
    else {
      const sel = scopeOf(m);
      if (!sel) { out.push(`/* mode "${m}" has no scope — skipped */`); continue; }
      out.push(`/* ${m} */`, `${sel} {\n${body}\n}`, "");
    }
  }
  if (media.length) out.push("/* reduced-motion */", "@media (prefers-reduced-motion: reduce) {", media.join("\n"), "}", "");
  return out.join("\n");
}

module.exports = { buildCss };

if (require.main === module) {
  const dir = path.resolve(__dirname, "..", "tokens");
  const src = process.argv[2] || path.join(dir, "tokens.json");
  const dst = process.argv[3] || path.join(dir, "tokens.css");
  fs.writeFileSync(dst, buildCss(JSON.parse(fs.readFileSync(src, "utf8"))));
  console.log("wrote " + dst);
}
