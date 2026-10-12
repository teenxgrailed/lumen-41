#!/usr/bin/env node
/* extract-tokens.js — CSS custom properties → W3C design tokens (DTCG) JSON.
 *
 *   node port/tools/extract-tokens.js          (from needt-app/, or anywhere)
 *
 * Reads, in cascade order (the order index-dev.html / mobile-dev.html link them):
 *   ../_ds/<design system>/tokens/*.css   (the DS bundle's tokens, styles.css import order)
 *   themes.css, composer.css, exposure-wordmark.css, app.css, styles/*.css
 * Writes:
 *   port/tokens/tokens.json        DTCG tokens, grouped, light value in $value, every mode in $extensions
 *   port/tokens/tokens.css         regenerated FROM tokens.json (build-tokens-css.js) — the round-trip proof
 *   port/tokens/tokens-report.md   unused / duplicate / redeclared / scoped tokens (grep of the sources)
 * and checks the round trip: tokens.css re-parsed must give exactly the declarations extracted here.
 *
 * Needs postcss (npm i postcss in /home/claude/nb2 — resolved from ../node_modules).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(APP, "port", "tokens");
const postcss = require(require.resolve("postcss", { paths: [APP, ROOT, path.join(ROOT, "node_modules")] }));
const { buildCss } = require("./build-tokens-css.js");

/* ---------- 1. sources ---------- */
const dsDir = fs.readdirSync(path.join(ROOT, "_ds")).map((d) => path.join(ROOT, "_ds", d)).find((d) => fs.existsSync(path.join(d, "styles.css")));
const dsOrder = (fs.readFileSync(path.join(dsDir, "styles.css"), "utf8").match(/@import url\("\.\/(tokens\/[^"]+)"\)/g) || [])
  .map((s) => s.match(/"\.\/([^"]+)"/)[1]);
const appCss = ["themes.css", "composer.css", "exposure-wordmark.css", "app.css"]
  .concat(fs.readdirSync(path.join(APP, "styles")).filter((f) => f.endsWith(".css")).sort().map((f) => "styles/" + f));
const sources = dsOrder.map((f) => ({ file: path.join(dsDir, f), label: "DS " + f }))
  .concat(appCss.map((f) => ({ file: path.join(APP, f), label: f })));

/* ---------- 2. selector → mode ---------- */
const ACCENTS = [];
function splitSelectors(sel) { // split on top-level commas (not inside :is(...))
  const out = []; let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/* A mode is where a value applies: light / dark (the two shipped themes), warm / dim (legacy
   previews, still defined), accent:<id>:light|dark, reduced-motion, font-inter. Anything else
   (.dt-themed, .co-box, .dx-c-red, :root[data-dt-ambient]…) is a component-scoped variable,
   not a token: listed in the report, not in tokens.json. */
function modesOf(selector, media) {
  const modes = new Set();
  for (let s of splitSelectors(selector)) {
    s = s.replace(/\s+/g, " ");
    let m;
    if ((m = s.match(/^\[data-accent="([a-z]+)"\](.*)$/)) || (m = s.match(/^(?::is\(\.dark, \.dim\)|\.dark|\.dim) \[data-accent="([a-z]+)"\]()$/))) {
      if (!ACCENTS.includes(m[1])) ACCENTS.push(m[1]);
      const dark = /dark|dim/.test(s);
      modes.add("accent:" + m[1] + ":" + (dark ? "dark" : "light"));
      continue;
    }
    if (/^(:root|html|\.paper)$/.test(s)) modes.add(media ? media : "light");
    else if (/^(\.dark|html\.dark|:root\.dark)$/.test(s)) modes.add(media ? media + ":dark" : "dark");
    else if (s === ".warm") modes.add("warm");
    else if (/^(\.dim|html\.dim)$/.test(s)) modes.add("dim");
    else if (s === 'html[data-font="inter"]') modes.add("font-inter");
    else modes.add("scoped:" + s);
  }
  return [...modes];
}

/* ---------- 3. parse ---------- */
const decls = [];   // every declaration of a custom property, in cascade order
const warnings = [];
let seq = 0;
for (const src of sources) {
  if (!fs.existsSync(src.file)) continue;
  const text = fs.readFileSync(src.file, "utf8");
  let root;
  try { root = postcss.parse(text, { from: src.file }); }
  catch (e) { warnings.push(`${src.label}: not parsed (${e.reason || e.message} at ${e.line}:${e.column}) — its custom properties are skipped`); continue; }
  root.walkDecls(/^--/, (d) => {
    const rule = d.parent;
    if (!rule || rule.type !== "rule") return;
    let media = null, p = rule.parent;
    while (p && p.type !== "root") {
      if (p.type === "atrule" && p.name === "media") {
        if (/prefers-reduced-motion:\s*reduce/.test(p.params)) media = "reduced-motion";
        else media = "media:" + p.params.replace(/\s+/g, " ");
      }
      p = p.parent;
    }
    let note = null;
    const nx = d.next();
    if (nx && nx.type === "comment" && nx.source && d.source && nx.source.start.line === d.source.end.line) {
      note = nx.text.replace(/@kind \w+/g, "").trim() || null;
    }
    decls.push({ name: d.prop, value: d.value.replace(/\s+/g, " ").trim(), modes: modesOf(rule.selector, media), selector: rule.selector.replace(/\s+/g, " "), file: src.label, line: d.source.start.line, note, seq: seq++ });
  });
}

/* ---------- 4. cascade per mode (last declaration wins) ---------- */
const byMode = {}; // mode → name → decl
const redeclared = []; // same mode declared twice with different values
for (const d of decls) {
  for (const m of d.modes) {
    const t = (byMode[m] = byMode[m] || {});
    if (t[d.name] && t[d.name].value !== d.value && !m.startsWith("scoped:")) redeclared.push({ mode: m, name: d.name, from: t[d.name], to: d });
    t[d.name] = d;
  }
}
const tokenModes = Object.keys(byMode).filter((m) => !m.startsWith("scoped:") && !m.startsWith("media:"));
const names = new Set();
for (const m of tokenModes) for (const n of Object.keys(byMode[m])) names.add(n);

/* ---------- 5. grouping ---------- */
const G = [
  ["z", /^z-/],
  ["motion", /^(duration-|transition-|ease-|nx-in$|nx-out$|nx-ease$|.*-(ease|spring|dur|duration)$|chat-(spring|out))/],
  ["radius", /^radius-|-radius$/],
  ["space", /^(space-|spacing-|gap-|form-label-w$|pad-)/],
  ["type", /^(type-|font-|weight-|lh-|tracking-|leading-|text-size-)/],
  ["blur", /(^|-)blur($|-)/],
  ["shadow", /(^|-)shadow($|-)|^elevation-/],
  ["glass", /glass|frost|mist|(^|-)fog($|-)|floating-fill|toolbar-fill/],
  ["sky", /^(sky-|orb-|drift-|dt-|pk-sky|nva-sky|px-|time-)/],
  ["accent", /^(accent|fill-accent|ring-accent|selected-)/],
  ["ink", /^(text-|foreground|ink-|on-)/],
  ["surface", /^(background|surface-|fill-|border|canvas-|page-|overlay-|scrollbar-)/],
  ["color", /^(color-|white-|black-|brand-|hue-|swatch-|smoke-|status-|success|info|destructive|warning|ring-|mock-|demo-|gray-)/],
];
const COMPONENT_PREFIX = /^(doc|pdc2|pdc|nva|ppl|v2p|pk|ios|paywall|dsp|control|pov|dialog|ptk|phb|nx|pml|badge|button|hb|promo|row|sidebar|status|switch|menu|kbd|mob2|dc|cursor|hour|form|transition)-/;
const lightOf = (name) => (byMode.light && byMode.light[name] ? byMode.light[name].value : "");
function groupOf(name) {
  const n = name.slice(2);
  if (/^(doc|paywall)-art-/.test(n)) return ["component", n.split("-")[0]];
  if (/^text-/.test(n) && /^-?[\d.]+(px|rem|em)$/.test(lightOf(name))) return ["type"];
  if (/^scrollbar-w/.test(n)) return ["component", "scrollbar"];
  for (const [g, re] of G) if (re.test(n)) return [g];
  const m = n.match(COMPONENT_PREFIX) || n.match(/^([a-z0-9]+)-/);
  return ["component", m ? m[1] : "misc"];
}

/* ---------- 6. types ---------- */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(|transparent$|white$|black$|currentColor$)/i;
function typeOf(name, value, group) {
  const v = value.trim();
  if (/^cubic-bezier\(/.test(v) || (group === "motion" && /^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(v))) return "cubicBezier";
  if (/^-?[\d.]+m?s$/.test(v)) return "duration";
  if (group === "z" || /^-?\d+$/.test(v)) return "number";
  if (/^-?[\d.]+$/.test(v)) return "number";
  if (/^weight-/.test(name.slice(2))) return "fontWeight";
  if (/^-?[\d.]+(px|rem|em|vh|vw|%)$/.test(v)) return "dimension";
  if (/^(linear|radial|conic)-gradient\(/.test(v)) return "gradient";
  if (group === "shadow" || /(^|\s)inset(\s|$)|\d px \d|0 0 0 1px/.test(v)) return "shadow";
  if (COLOR_RE.test(v)) return "color";
  if (/^weight-/.test(name.slice(2))) return "fontWeight";
  if (/^type-/.test(name.slice(2))) return "typography";
  if (/^font-/.test(name.slice(2)) && /,|serif|sans|mono/.test(v)) return "fontFamily";
  if (group === "type" && /\dpx\//.test(v)) return "typography";
  if (group === "motion") return "transition";
  if (/^var\(--[a-z0-9-]+\)$/i.test(v)) return null; // alias: type comes from the target
  return "string";
}
function bezier(v) {
  const k = { ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1], linear: [0, 0, 1, 1] };
  if (k[v]) return k[v];
  const m = v.match(/^cubic-bezier\(([^)]+)\)$/);
  return m ? m[1].split(",").map(Number) : v;
}

/* ---------- 7. build the token tree ---------- */
const pathOf = {}; // css name → "group.sub.name"
for (const n of names) pathOf[n] = groupOf(n).concat(n.slice(2)).join(".");
const asAlias = (v) => { const m = v.match(/^var\((--[a-z0-9_-]+)\)$/i); return m && pathOf[m[1]] ? "{" + pathOf[m[1]] + "}" : null; };

const tree = {
  $description: "Needt design tokens — extracted by port/tools/extract-tokens.js from the DS bundle tokens + themes.css + app.css + styles/*.css. $value = the light theme; $extensions['app.needt'].modes holds every mode the token is declared in (light, dark, warm, dim, reduced-motion, accent:<id>:light|dark). Do not edit by hand — regenerate.",
  $extensions: { "app.needt": { generated: new Date().toISOString().slice(0, 10), accents: ACCENTS, modes: tokenModes.sort() } },
};
function put(pathArr, tok) {
  let node = tree;
  for (const k of pathArr.slice(0, -1)) node = node[k] = node[k] || {};
  node[pathArr[pathArr.length - 1]] = tok;
}
for (const n of [...names].sort()) {
  const grp = groupOf(n);
  const modes = {};
  for (const m of tokenModes) if (byMode[m][n]) modes[m] = byMode[m][n].value;
  const base = modes.light !== undefined ? modes.light : modes.dark !== undefined ? modes.dark : Object.values(modes)[0];
  const first = decls.find((d) => d.name === n && !d.modes.every((m) => m.startsWith("scoped:")));
  let type = typeOf(n, base, grp[0]);
  const alias = asAlias(base);
  const tok = {};
  if (type) tok.$type = type;
  tok.$value = alias || (type === "cubicBezier" ? bezier(base) : base);
  const note = decls.filter((d) => d.name === n && d.note).map((d) => d.note)[0];
  if (note) tok.$description = note;
  tok.$extensions = { "app.needt": { css: n, modes, source: first ? first.file + ":" + first.line : null } };
  put(grp.concat(n.slice(2)), tok);
}
/* Accent presets: the same --accent* names under [data-accent=<id>]; listed per preset for
   readability (accent.preset.<id>) — the values also sit in each token's modes. */
tree.accent = tree.accent || {};
tree.accent.preset = {};
for (const a of ACCENTS) {
  const g = (tree.accent.preset[a] = {});
  for (const side of ["light", "dark"]) {
    const t = byMode["accent:" + a + ":" + side] || {};
    for (const n of Object.keys(t)) {
      g[n.slice(2)] = g[n.slice(2)] || { $type: typeOf(n, t[n].value, "accent") || "color", $value: t[n].value, $extensions: { "app.needt": { css: n, modes: {}, presetOf: pathOf[n] } } };
      g[n.slice(2)].$extensions["app.needt"].modes[side] = t[n].value;
    }
    for (const k of Object.keys(g)) if (side === "light" && g[k].$extensions["app.needt"].modes.light) g[k].$value = g[k].$extensions["app.needt"].modes.light;
  }
}

/* ---------- 8. motion from MOTION.md (curves table + the duration scale) ---------- */
const motionMd = fs.readFileSync(path.join(APP, "MOTION.md"), "utf8");
const curvesSec = motionMd.split("### Curves")[1].split("###")[0];
tree.motion = tree.motion || {};
tree.motion.curve = { $description: "Named curves from MOTION.md § Curves (aliases used in prose; the CSS writes them literally or via --ease-pop / --nx-ease / --chat-*)." };
for (const row of curvesSec.split("\n")) {
  const m = row.match(/^\|\s*`([a-z0-9-]+)`\s*\|\s*`(cubic-bezier\([^)]+\))`/);
  if (m) tree.motion.curve[m[1]] = { $type: "cubicBezier", $value: bezier(m[2].replace(/\s+/g, " ")), $extensions: { "app.needt": { from: "MOTION.md" } } };
}
const scale = (motionMd.match(/The scale is therefore \*\*([^*]+)\*\*/) || [])[1];
tree.motion.scale = { $description: "The duration scale (MOTION.md § Motion tokens). Anything else is off-scale (MOTION.md § Violations D)." };
if (scale) for (const ms of scale.split("·").map((s) => s.trim())) tree.motion.scale["d" + ms] = { $type: "duration", $value: ms + "ms" };

/* ---------- 8b. blur — there are no blur tokens in the CSS; the radii are literal. Record the
   observed scale (backdrop-filter / filter blur(Npx) across the live CSS + JSX) so the port can
   name them. Reference entries: no CSS is generated for them. ---------- */
{
  const hist = {};
  const files = appCss.map((f) => path.join(APP, f)).concat(fs.readdirSync(APP).filter((f) => f.endsWith(".jsx")).map((f) => path.join(APP, f)));
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, "utf8");
    let m; const re = /blur\(\s*([\d.]+)px\s*\)/g;
    while ((m = re.exec(t))) hist[m[1]] = (hist[m[1]] || 0) + 1;
  }
  tree.blur = { $description: "Observed blur radii (literal blur(Npx) in the live CSS / JSX — backdrop-filter glass, fog, sky, doc backdrop 22px). No --blur-* tokens exist yet; count = occurrences. Reference only (not in tokens.css)." };
  for (const px of Object.keys(hist).sort((a, b) => a - b)) tree.blur["b" + px.replace(".", "_")] = { $type: "dimension", $value: px + "px", $extensions: { "app.needt": { occurrences: hist[px] } } };
}

/* ---------- 9. write tokens.json + tokens.css ---------- */
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "tokens.json"), JSON.stringify(tree, null, 2) + "\n");
const css = buildCss(tree);
fs.writeFileSync(path.join(OUT, "tokens.css"), css);

/* ---------- 10. round trip: tokens.css must hold exactly the extracted (mode, name, value) set ---------- */
const want = new Map();
for (const m of tokenModes) for (const n of Object.keys(byMode[m])) want.set(m + "|" + n, byMode[m][n].value);
const got = new Map();
postcss.parse(css).walkDecls(/^--/, (d) => {
  const rule = d.parent; let media = null;
  if (rule.parent && rule.parent.type === "atrule") media = /reduced-motion/.test(rule.parent.params) ? "reduced-motion" : null;
  for (const m of modesOf(rule.selector, media)) got.set(m + "|" + d.prop, d.value.replace(/\s+/g, " ").trim());
});
const missing = [...want].filter(([k, v]) => got.get(k) !== v);
const extra = [...got.keys()].filter((k) => !want.has(k));
const roundTrip = { declarations: want.size, ok: missing.length === 0 && extra.length === 0, missing: missing.slice(0, 20), extra: extra.slice(0, 20) };

/* ---------- 11. usage grep → report ---------- */
const SKIP = new Set(["_archive", "_orig", "build", "port", "vendor", "node_modules", "app-icon", "app-icons", "app-icons-v2"]);
const usageFiles = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (SKIP.has(f)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(jsx?|css|html)$/.test(f) && !/^(index|mobile|app)\.html$/.test(f) && !f.startsWith("_")) usageFiles.push(p);
  }
})(APP);
usageFiles.push(path.join(dsDir, "_ds_bundle.js"));
for (const f of fs.readdirSync(path.join(dsDir, "tokens"))) usageFiles.push(path.join(dsDir, "tokens", f));
const corpus = usageFiles.map((f) => ({ f: path.relative(APP, f), t: fs.readFileSync(f, "utf8") }));
const allNames = new Set(decls.map((d) => d.name));
const uses = {}; // name → count of reads (var(--x) / '--x' string in JS), not declarations
for (const n of allNames) uses[n] = 0;
const readRe = /var\(\s*(--[a-zA-Z0-9_-]+)|["'`](--[a-zA-Z0-9_-]+)["'`]/g;
const dynPrefixes = new Set();
for (const { t } of corpus) {
  let m;
  while ((m = readRe.exec(t))) { const n = m[1] || m[2]; if (n in uses) uses[n]++; }
  const dynRe = /["'`(](--[a-zA-Z0-9_-]+-)(?:\$\{|["'`]\s*\+)/g;
  while ((m = dynRe.exec(t))) dynPrefixes.add(m[1]);
}
const dynamic = (n) => [...dynPrefixes].find((p) => n.startsWith(p));
const tokenNames = [...names].sort();
const unused = tokenNames.filter((n) => uses[n] === 0 && !dynamic(n));
const dynOnly = tokenNames.filter((n) => uses[n] === 0 && dynamic(n));
// duplicates: identical value in every mode it is declared in (literal values only, not aliases)
const sig = {};
for (const n of tokenNames) {
  const modes = {};
  for (const m of tokenModes) if (byMode[m][n]) modes[m] = byMode[m][n].value;
  if (Object.values(modes).some((v) => /var\(/.test(v))) continue;
  const key = JSON.stringify([groupOf(n).join("."), modes.light === undefined ? "—" : modes.light, modes.dark === undefined ? "(same)" : modes.dark]);
  if (modes.light === undefined && modes.dark === undefined) continue;
  (sig[key] = sig[key] || []).push(n);
}
const dups = Object.entries(sig).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
const dsOverride = redeclared.filter((r) => r.from.file.startsWith("DS ") && !r.to.file.startsWith("DS "));
const appRedecl = redeclared.filter((r) => !dsOverride.includes(r));
const scopedNames = {};
for (const d of decls) if (d.modes.every((m) => m.startsWith("scoped:") || m.startsWith("media:"))) (scopedNames[d.name] = scopedNames[d.name] || new Set()).add(d.selector + " (" + d.file + ")");
const counts = {};
(function count(node, p) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    if (v && typeof v === "object" && "$value" in v) counts[p[0]] = (counts[p[0]] || 0) + 1;
    else if (v && typeof v === "object") count(v, p.length ? p : [k]);
  }
})(tree, []);

const L = [];
L.push("# Token report", "", `Generated by \`port/tools/extract-tokens.js\` on ${new Date().toISOString().slice(0, 10)}. Usage = reads (\`var(--x)\` or a \`'--x'\` string for \`cssVar()\` / \`setProperty\`) in every live .jsx/.js/.css/.html of needt-app (not \`_archive\`, \`_orig\`, \`build\`, generated pages) plus the DS bundle and DS tokens. A snapshot: dead-code cleanup running in parallel can change it.`, "");
L.push("## Summary", "", `- Custom-property declarations parsed: **${decls.length}** from ${sources.length} files`, `- Tokens (theme-level, in tokens.json): **${tokenNames.length}** + ${ACCENTS.length} accent presets + motion curves/scale from MOTION.md`, `- Modes: ${tokenModes.sort().join(", ")}`, `- Round trip tokens.json → tokens.css → re-parse: **${roundTrip.ok ? "OK" : "FAILED"}** (${roundTrip.declarations} mode×token declarations)`, `- Unused tokens (no read anywhere): **${unused.length}**`, `- Read only through a dynamic name (\`--x-\${id}\` / \`"--x-" + id\`): ${dynOnly.length}`, `- Duplicate-value groups (same literal value in light and dark): **${dups.length}** groups, ${dups.reduce((a, [, v]) => a + v.length, 0)} tokens`, `- Redeclared in the same mode inside the app CSS (earlier value dead): **${appRedecl.length}**; design-system values overridden by the app: ${dsOverride.length}`, `- Component-scoped variables (not tokens): ${Object.keys(scopedNames).length}`, "");
L.push("Per group: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · "), "");
if (warnings.length) L.push("## Warnings", "", ...warnings.map((w) => "- " + w), "");
L.push("## Unused tokens", "", "Declared in a theme scope, read nowhere. Candidates to drop in the port (check the DS components before dropping a DS token).", "", "| Token | Group | Declared |", "| --- | --- | --- |");
for (const n of unused) { const d = decls.find((x) => x.name === n); L.push(`| \`${n}\` | ${groupOf(n).join(".")} | ${d.file}:${d.line} |`); }
L.push("", "## Read only dynamically", "", "No literal read, but a template builds the name — keep them (e.g. `--pdc2-c-${id}`).", "", "Prefixes found: " + [...dynPrefixes].sort().map((p) => "`" + p + "`").join(", "), "", dynOnly.map((n) => "`" + n + "`").join(", ") || "—", "");
L.push("## Duplicate values", "", "Tokens of one group whose literal value is identical in light AND dark (`(same)` = no dark override). Not all are mistakes (a role may deliberately equal another today), but each row is a merge candidate: keep one name, alias the rest.", "", "| Group | Value (light · dark) | Tokens |", "| --- | --- | --- |");
for (const [k, v] of dups) { const [g, l, dk] = JSON.parse(k); L.push(`| ${g} | \`${l}\` · \`${dk}\` | ${v.map((n) => "`" + n + "`").join(", ")} |`); }
L.push("", "## Redeclared in the same mode (app CSS)", "", "Declared twice for one mode inside the app's own CSS with different values; the cascade keeps the later, so the earlier is dead — keep one.", "", "| Mode | Token | Earlier (dead) | Wins |", "| --- | --- | --- | --- |");
for (const r of appRedecl) L.push(`| ${r.mode} | \`${r.name}\` | \`${r.from.value}\` (${r.from.file}:${r.from.line}) | \`${r.to.value}\` (${r.to.file}:${r.to.line}) |`);
if (!appRedecl.length) L.push("| — | none | | |");
L.push("", "## Design-system values the app overrides", "", "themes.css replaces a DS token for a mode (intended: dark one step lighter, the ring-first bevel…). In the port, fold the app value into the token instead of overriding it.", "", "| Mode | Token | DS value | App value |", "| --- | --- | --- | --- |");
for (const r of dsOverride) L.push(`| ${r.mode} | \`${r.name}\` | \`${r.from.value}\` (${r.from.file}:${r.from.line}) | \`${r.to.value}\` (${r.to.file}:${r.to.line}) |`);
L.push("", "## Component-scoped variables (not exported as tokens)", "", "Set on a component selector (runtime hooks such as `--hue`, the Time theme's ambient, doc page themes). They stay with their component in the port.", "", "| Variable | Where |", "| --- | --- |");
for (const [n, s] of Object.entries(scopedNames).sort()) L.push(`| \`${n}\` | ${[...s].slice(0, 3).join("; ").replace(/\|/g, "\\|")}${s.size > 3 ? " …" : ""} |`);
fs.writeFileSync(path.join(OUT, "tokens-report.md"), L.join("\n") + "\n");

console.log(JSON.stringify({ declarations: decls.length, tokens: tokenNames.length, accents: ACCENTS, modes: tokenModes, perGroup: counts, roundTrip, unused: unused.length, dynamicOnly: dynOnly.length, duplicateGroups: dups.length, redeclaredInApp: appRedecl.length, dsOverrides: dsOverride.length, scoped: Object.keys(scopedNames).length, warnings }, null, 1));
if (!roundTrip.ok) process.exitCode = 1;
