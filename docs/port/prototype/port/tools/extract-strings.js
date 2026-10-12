#!/usr/bin/env node
/* extract-strings.js — every user-visible UI string in the program's .jsx (+ connections-data.js),
 * keyed by file → component → key, for i18n later.
 *
 *   node port/tools/extract-strings.js
 *
 * Which files: the scripts index-dev.html and mobile-dev.html load (the program), minus files the
 * port does not take (PORT.md §3: BlockDesigns.jsx / RichBlock.jsx are not rendered, ios-frame.jsx
 * is the presentation frame, Brief.jsx is behind ?form=). Plus connections-data.js (labels and
 * descriptions of every connection).
 *
 * What counts as copy (Babel AST, JSX kept):
 *   1. JSX text.
 *   2. JSX attributes that carry words: title, placeholder, aria-label, alt, label, desc, sub, meta,
 *      line, hint, kicker, empty, text, caption, tip, doneLabel, laterLabel, addLabel, compactTitle, a, b.
 *   3. String literals inside a JSX expression ({cond ? "Done" : "Open"}) except className /
 *      style / data-* / key / id / href / src / type / name / role attributes.
 *   4. Outside JSX: arguments of toast( / say( / notify( / alert( / confirm( / snack;
 *      values of object properties named like copy (label, title, sub, desc, hint, placeholder,
 *      line, meta, text, empty, kicker, cta, tip, caption, heading, note, name, sentence, action,
 *      lead, body when a string); the second item of ["id", "Label"] pairs.
 *   A candidate must look like words: a letter, and not an identifier / class / CSS / URL / path.
 * Not copy: seed and demo content (declarations named *SEED*, DOCS, TEMPLATES, C2_EVENTS,
 * chatSeed, mbmSeed… and Data.js) — that is fixture data (port/fixtures), counted in _meta.
 * Output: port/strings/en.json  { _meta, "<file>": { "<Component>": { "<key>": "text" } } }
 */
"use strict";
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..", "..");
const Babel = require(require.resolve("@babel/standalone", { paths: [APP, path.resolve(APP, ".."), path.resolve(APP, "..", "node_modules")] }));
const OUT = path.join(APP, "port", "strings", "en.json");

const SKIP_FILES = new Set(["BlockDesigns.jsx", "RichBlock.jsx", "ios-frame.jsx", "Brief.jsx"]);
const loaded = [];
for (const page of ["index-dev.html", "mobile-dev.html"]) {
  const html = fs.readFileSync(path.join(APP, page), "utf8");
  for (const m of html.matchAll(/<script[^>]*src="([^"?]+)(?:\?[^"]*)?"/g)) {
    const f = m[1];
    if (/^https?:|^\.\.\//.test(f) || !f.endsWith(".jsx")) continue;
    if (!loaded.includes(f)) loaded.push(f);
  }
}
const files = loaded.filter((f) => !SKIP_FILES.has(f)).concat(["connections-data.js"]);

const COPY_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "label", "desc", "sub", "meta", "line", "hint", "kicker", "empty", "text", "caption", "tip", "doneLabel", "laterLabel", "addLabel", "compactTitle", "a", "b", "heading", "subtitle", "cta", "action", "note", "message", "description", "aria-description", "aria-roledescription"]);
const NONCOPY_ATTRS = /^(className|style|key|id|href|src|type|name|role|ref|value|htmlFor|for|tabIndex|data-.*|aria-(controls|labelledby|describedby|hidden|current|checked|expanded|pressed|selected|haspopup|live|modal|orientation|valuenow|valuemin|valuemax)|d|viewBox|fill|stroke.*|transform|points|x|y|cx|cy|r|rx|ry|width|height|offset|stopColor|stop-color|gradientUnits|clipPath|mask|filter|preserveAspectRatio|xmlns.*|icon|glyph|place|kind|art|tone|size|variant|hue|color|as|screen|detents|accept|autoComplete|inputMode|enterKeyHint|spellCheck|dir|lang|target|rel|method|draggable|contentEditable|pattern)$/;
const COPY_PROPS = new Set(["label", "title", "sub", "desc", "description", "hint", "placeholder", "line", "meta", "text", "empty", "kicker", "cta", "tip", "caption", "heading", "note", "name", "sentence", "action", "lead", "subtitle", "button", "short", "long", "help", "tagline", "summary", "badge", "chip", "say", "toast", "undo", "confirm", "body", "ask", "q", "a", "why", "what", "how", "free", "pro", "intro", "outro", "footnote", "trialAfter", "trialShort", "price", "per", "save", "doneLabel", "laterLabel", "lost", "account", "scopeLine"]);
const UI_CALLS = /^(toast|say|notify|alert|confirm|setSnack|showToast|announce|pwToast|mbToast|setHint|setMsg|setError|setNote)$/;
const SEED_DECL = /SEED|Seed|seed|DEMO|SAMPLE|FIXTURE|^DOCS$|^TEMPLATES$|^C2_EVENTS$|^tasks$|^mail$|^HABIT_STRIPS$|^MB_BOARDS|^MB_DOCS$|^MB_TEMPLATES$|mbmBoards|mbBoardsSeed|^PW_FEED|^CHAT_SAMPLES/;

function looksLikeCopy(s) {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || !/[A-Za-zÀ-ɏ]/.test(t)) return false;
  if (/^(https?:|mailto:|data:|#|\.\/|\/|var\(|rgba?\(|linear-gradient|cubic-bezier|calc\()/.test(t)) return false;
  if (/^[a-z0-9]+([-_.:/][a-z0-9]+)+$/.test(t)) return false; // pk-row, needt.tasks, a/b
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/^(ok|no|yes|or|and|on|off)$/.test(t)) return false; // identifiers / keys
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3) return false; // CONSTANTS
  if (/^[\w-]+\s*:\s*[^ ]+;?$/.test(t)) return false; // css decl
  if (/var\(--|color-mix\(|rgba?\(|oklch\(|cubic-bezier\(|(translate|rotate|scale)[XYZ3d]*\(|\b\d+(\.\d+)?(px|ms|deg|vh|vw)\b.*\d+(px|ms|%)/.test(t)) return false; // css values
  if (/^(\.|#)?[a-z][\w-]*(\s+[.#]?[a-z][\w-]*)+$/.test(t) && /-/.test(t)) return false; // "pk-row is-on"
  if (/^(top|bottom|center|left|right)( (top|bottom|center|left|right))?$/.test(t) || /^[MmLlCcZz][\d.\s,-]/.test(t)) return false; // origins, svg paths
  if (/^\d+(px|ms|s|%|em|rem)?(\s+\d+(px|%)?)*$/.test(t)) return false;
  if (/^[A-Z][a-z]{2} \d{1,2}$|^\d{1,2} [A-Z][a-z]{2}$/.test(t)) return true; // dates are copy-ish (kept)
  return true;
}
const slug = (s) => s.toLowerCase().replace(/[‘’'“”"]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "text";

const out = {};
const meta = { generated: new Date().toISOString().slice(0, 10), files: 0, strings: 0, unique: 0, byKind: {}, skippedSeedDeclarations: {}, skippedFiles: [...SKIP_FILES], parseErrors: [] };
const uniq = new Set();

for (const f of files) {
  const file = path.join(APP, f);
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, "utf8");
  const found = []; // [component, text, kind]
  const plugin = ({ types: t }) => ({
    visitor: {
      Program(p) {
        p.traverse({
          JSXText(q) { add(q, q.node.value, "jsx-text"); },
          JSXAttribute(q) {
            const n = q.node.name.name && (typeof q.node.name.name === "string" ? q.node.name.name : q.node.name.name.name);
            const v = q.node.value;
            if (!v) return;
            if (v.type === "StringLiteral" && COPY_ATTRS.has(n)) add(q, v.value, "jsx-attr");
          },
          StringLiteral(q) { visitLiteral(q, q.node.value); },
          TemplateLiteral(q) {
            // a template with words: keep the static text with {0} {1} placeholders
            const parts = q.node.quasis.map((x) => x.value.cooked);
            if (!parts.join("").match(/[A-Za-z]{2,}\s/)) return;
            visitLiteral(q, parts.reduce((a, s, i) => a + (i ? "{" + (i - 1) + "}" : "") + s, ""));
          },
        });
      },
    },
  });
  function component(q) {
    let p = q, name = null;
    while (p) {
      const n = p.node;
      if (n.type === "FunctionDeclaration" && n.id) name = n.id.name;
      else if (n.type === "VariableDeclarator" && n.id && n.id.name) name = n.id.name;
      else if (n.type === "ObjectProperty" && n.key && (n.key.name || n.key.value) && !name) { /* keep walking */ }
      if (name && /^[A-Z]/.test(name)) return name;
      p = p.parentPath;
    }
    return name || "_module";
  }
  function topDecl(q) {
    let p = q, last = null;
    while (p) { if (p.node.type === "VariableDeclarator" || p.node.type === "FunctionDeclaration") last = p.node.id && p.node.id.name; p = p.parentPath; }
    return last;
  }
  function inJsx(q) {
    let p = q.parentPath;
    while (p) {
      const ty = p.node.type;
      if (ty === "JSXAttribute") {
        const n = p.node.name.name;
        const nm = typeof n === "string" ? n : n && n.name;
        return NONCOPY_ATTRS.test(nm) ? "skip" : "attr";
      }
      if (ty === "JSXExpressionContainer") {
        // a child expression; but not when inside a call like cx("a", "b") / an index lookup
        return "child";
      }
      if (/Function|Class|Program/.test(ty)) return null;
      p = p.parentPath;
    }
    return null;
  }
  function visitLiteral(q, value) {
    if (q.parentPath.node.type === "JSXAttribute") return; // handled above
    if (q.parentPath.node.type === "ImportDeclaration") return;
    const parent = q.parentPath.node;
    // property keys, member lookups, comparisons, switch cases are never copy
    if (parent.type === "ObjectProperty" && parent.key === q.node) return;
    if (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") return;
    if (parent.type === "BinaryExpression" && /^(===|!==|==|!=|in)$/.test(parent.operator)) return;
    if (parent.type === "SwitchCase") return;
    const where = inJsx(q);
    if (where === "skip") return;
    if (where) {
      // inside JSX: skip literals that are arguments of class / style helpers
      if (parent.type === "CallExpression" && parent.callee && /(^|\.)(cx|pkCx|psCx|mbCx|clsx|classNames|cssVar|var|t|is|includes|indexOf|startsWith|getItem|get|has|join|split|replace|toLocaleDateString|toLocaleTimeString|padStart|querySelector|closest|matches|setProperty|getPropertyValue|createElement|Icon)$/.test(calleeName(parent.callee))) return;
      add(q, value, where === "attr" ? "jsx-attr-expr" : "jsx-expr");
      return;
    }
    // outside JSX
    if (SEED_DECL.test(topDecl(q) || "")) { const k = topDecl(q); meta.skippedSeedDeclarations[f + ":" + k] = (meta.skippedSeedDeclarations[f + ":" + k] || 0) + 1; return; }
    if (parent.type === "CallExpression" && UI_CALLS.test(calleeName(parent.callee).split(".").pop())) return add(q, value, "call");
    if (parent.type === "ObjectProperty" && parent.value === q.node) {
      const k = parent.key.name || parent.key.value;
      if (COPY_PROPS.has(k)) return add(q, value, "prop");
      return;
    }
    if (parent.type === "ArrayExpression" && parent.elements.length >= 2 && parent.elements.indexOf(q.node) >= 1) {
      const first = parent.elements[0];
      const gp = q.parentPath.parentPath && q.parentPath.parentPath.node;
      if (first && first.type === "StringLiteral" && /^[\w-]+$/.test(first.value) && gp && gp.type === "ArrayExpression" && parent.elements.indexOf(q.node) === 1) return add(q, value, "pair");
    }
    if (parent.type === "ConditionalExpression" || parent.type === "LogicalExpression" || parent.type === "ReturnStatement") {
      // a returned / chosen sentence (label helpers): only full words with a space or a capital start
      if (/^[A-Z‘“"(]/.test(value.trim()) && /[a-z]/.test(value)) return add(q, value, "expr");
    }
  }
  function calleeName(c) {
    if (!c) return "";
    if (c.type === "Identifier") return c.name;
    if (c.type === "MemberExpression") return calleeName(c.object) + "." + (c.property.name || c.property.value || "");
    return "";
  }
  function add(q, raw, kind) {
    const text = String(raw).replace(/\s+/g, " ").trim();
    if (!looksLikeCopy(text)) return;
    if (kind === "jsx-expr" || kind === "jsx-attr-expr") {
      // single lowercase words inside JSX expressions are usually values ("on", "week"), not copy
      if (!/\s/.test(text) && !/^[A-Z0-9…“‘(]/.test(text)) return;
    }
    found.push([component(q), text, kind]);
  }
  try {
    Babel.transform(code, { ast: false, code: false, babelrc: false, configFile: false, sourceType: "script", parserOpts: { plugins: ["jsx"], allowReturnOutsideFunction: true }, plugins: [plugin] });
  } catch (e) { meta.parseErrors.push(f + ": " + e.message.split("\n")[0]); continue; }
  if (!found.length) continue;
  meta.files++;
  const byComp = (out[f] = {});
  const seen = {};
  for (const [comp, text, kind] of found) {
    const c = (byComp[comp] = byComp[comp] || {});
    const dupKey = comp + "\u0000" + text;
    if (seen[dupKey]) continue;
    seen[dupKey] = 1;
    let k = slug(text), n = 2;
    while (c[k] !== undefined) k = slug(text) + "_" + n++;
    c[k] = text;
    meta.strings++;
    meta.byKind[kind] = (meta.byKind[kind] || 0) + 1;
    uniq.add(text);
  }
}
meta.unique = uniq.size;
const sorted = {};
for (const f of Object.keys(out).sort()) sorted[f] = out[f];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(Object.assign({ _meta: meta }, sorted), null, 2) + "\n");
const perFile = Object.entries(sorted).map(([f, cs]) => [f, Object.values(cs).reduce((a, c) => a + Object.keys(c).length, 0)]).sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify({ files: meta.files, strings: meta.strings, unique: meta.unique, byKind: meta.byKind, parseErrors: meta.parseErrors, seedSkipped: Object.values(meta.skippedSeedDeclarations).reduce((a, b) => a + b, 0), top: perFile.slice(0, 12) }, null, 1));
