#!/usr/bin/env node
/* build.js — the production build of the prototype (08.10.26).

     node build.js              index-dev.html → index.html, mobile-dev.html → mobile.html,
                                app-dev.html → app.html (the one program, see buildApp)
     node build.js --no-minify  same, without terser (readable build/ output)

   The *-dev.html pages are the source: every .jsx is a <script type="text/babel">
   that Babel compiles in the browser, React is the development build. This
   script writes the pages people open:
   - every text/babel script (src or inline) is compiled ahead of time with
     the same @babel/standalone 7.29.0 and the exact options its
     transformScriptTags uses in the browser (presets react + env, no
     targets → ES5, "use strict"; plugins class-properties, object-rest-spread,
     flow-strip-types). env turns top-level const/let into var, which is why
     the scripts can share one global scope and repeat names (const { Icon } =
     … in many files) — the build keeps exactly that;
   - the core scripts are minified (terser, top-level names kept) and joined,
     in page order, into build/<page>.core.js, loaded with defer (deferred
     scripts run in order after parsing, as Babel's did after DOMContentLoaded);
   - scripts marked data-lazy="group" go to build/<page>.<group>.js instead and
     load on demand through needt-lazy.js; the page gets a manifest
     (window.__NEEDT_LAZY) naming, per group, the components and functions the
     core reaches by name (stand-ins are installed for them), the groups it
     depends on, and the window events it listens to at load (held and
     replayed). Anything else the core reads from a lazy group is an error;
   - react/react-dom development UMD → production.min (same version, same
     CDN); @babel/standalone is dropped;
   - local assets get ?v=<content hash>, so a changed file is never served
     from cache.
   After any source edit run `node build.js` again; index-dev.html /
   mobile-dev.html always run the sources directly.

   Needs @babel/standalone@7.29.0 and terser installed one folder up
   (/home/claude/nb2/node_modules) — the project folder stays free of
   node_modules. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const OUT = path.join(ROOT, "build");
const req = (m) => require(require.resolve(m, { paths: [ROOT, path.join(ROOT, "..")] }));
const Babel = req("@babel/standalone");
const MINIFY = !process.argv.includes("--no-minify");
const terser = MINIFY ? req("terser") : null;

const PAGES = [["index-dev.html", "index.html"], ["mobile-dev.html", "mobile.html"]];
/* What the core may reach in a lazy group, by name. Components get a
   stand-in that loads the group; FN_STUB functions get one that loads it and
   calls through (their result is a promise, so only fire-and-forget calls
   belong here). LEAVE: the core guards these itself and has a fallback until
   the group is in. */
const FN_STUB = new Set(["needtImport", "mailEdge"]);
const LEAVE = new Set(["cnLabel", "__chatInset", "plTplStore"]); // plTplStore: the sync bridge in stores.jsx (guarded)

/* ---- Babel, as transformScriptTags runs it (babel-standalone 7.29.0) ---- */
if (Babel.version !== "7.29.0") throw new Error("build.js: expected @babel/standalone 7.29.0 (the version the dev pages load), got " + Babel.version);
const BABEL_OPTS = (filename) => ({
  filename, sourceFileName: filename, sourceMaps: true,
  presets: ["react", "env"],
  plugins: ["transform-class-properties", "transform-object-rest-spread", "transform-flow-strip-types"],
  targets: { browsers: undefined }
});
/* Names a script declares at top level and the globals it reads — for the
   lazy-group manifest. */
function scan(src, filename) {
  const out = { decl: [], globals: [], winGet: new Set(), winSet: new Set(), holds: [] };
  const winName = (n) => n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "window" && !n.computed && n.property.name;
  const collectHolds = (body) => body.forEach((st) => {
    const e = st.type === "ExpressionStatement" && st.expression;
    if (!e) return;
    if (e.type === "CallExpression" && winName(e.callee) === "addEventListener" && e.arguments[0] && e.arguments[0].type === "StringLiteral")
      out.holds.push(e.arguments[0].value);
    // one level into a top-level IIFE
    if (e.type === "CallExpression" && /FunctionExpression$/.test(e.callee.type) && e.callee.body.body) collectHolds(e.callee.body.body);
  });
  Babel.transform(src, { filename, presets: ["react"], code: false, plugins: [() => ({ visitor: {
    Program: { exit(p) {
      out.decl = Object.keys(p.scope.bindings);
      out.globals = Object.keys(p.scope.globals);
      collectHolds(p.node.body);
    } },
    MemberExpression(p) {
      const n = winName(p.node); if (!n) return;
      const parent = p.parent;
      if (parent.type === "AssignmentExpression" && parent.left === p.node) out.winSet.add(n); else out.winGet.add(n);
    },
    // const { A, B } = window;   Object.assign(window, { A, B: x })
    VariableDeclarator(p) {
      if (p.node.init && p.node.init.type === "Identifier" && p.node.init.name === "window" && p.node.id.type === "ObjectPattern")
        p.node.id.properties.forEach((q) => { if (q.key && q.key.name) out.winGet.add(q.key.name); });
    },
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type === "MemberExpression" && c.object.name === "Object" && c.property.name === "assign" && p.node.arguments[0] &&
        p.node.arguments[0].type === "Identifier" && p.node.arguments[0].name === "window")
        p.node.arguments.slice(1).forEach((o) => { if (o.type === "ObjectExpression") o.properties.forEach((q) => { if (q.key && (q.key.name || q.key.value)) out.winSet.add(q.key.name || q.key.value); }); });
    }
  } })] });
  return out;
}

const compiled = new Map();
function compile(src, name) {
  if (compiled.has(name)) return compiled.get(name);
  const r = Babel.transform(src, BABEL_OPTS(name));
  const item = { name, code: r.code, map: r.map, info: scan(src, name) };
  compiled.set(name, item);
  return item;
}
async function minify(item) {
  if (item.min) return item.min;
  if (!MINIFY) { item.min = { code: item.code, map: item.map }; return item.min; }
  const r = await terser.minify({ [item.name]: item.code }, {
    toplevel: false, keep_fnames: true, keep_classnames: true, ie8: false, safari10: false,
    compress: { passes: 1 }, mangle: true, format: { comments: false },
    sourceMap: { content: item.map, asObject: true }
  });
  item.min = { code: r.code, map: r.map };
  return item.min;
}
const hash = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);

/* Join compiled scripts into one file with an index source map. Every piece
   is "use strict" at its top and the core has no function declared twice
   with different bodies (checked below), so one file runs as the separate
   scripts did. */
async function bundle(items, outName) {
  let code = "", line = 0;
  const sections = [];
  for (const it of items) {
    const m = await minify(it);
    sections.push({ offset: { line, column: 0 }, map: m.map });
    const piece = m.code.replace(/\n?\/\/# sourceMappingURL=.*$/, "") + "\n;\n";
    code += piece;
    line += piece.split("\n").length - 1;
  }
  fs.writeFileSync(path.join(OUT, outName + ".map"), JSON.stringify({ version: 3, file: outName, sections }));
  code += "//# sourceMappingURL=" + outName + ".map\n";
  fs.writeFileSync(path.join(OUT, outName), code);
  return { file: "build/" + outName, v: hash(code), bytes: code.length };
}

/* Function declarations that two core scripts both make, with different
   bodies, would change meaning when joined (the later one is hoisted over
   the earlier script). Babel's own helpers repeat with identical bodies. */
function checkJoin(items) {
  const seen = new Map();
  for (const it of items) {
    const ast = Babel.transform(it.code, { filename: it.name, ast: true, code: false, babelrc: false, configFile: false }).ast;
    for (const st of ast.program.body) if (st.type === "FunctionDeclaration") {
      const body = it.code.slice(st.start, st.end);
      const prev = seen.get(st.id.name);
      if (prev && prev.body !== body) throw new Error("build.js: function " + st.id.name + " is declared in both " + prev.file + " and " + it.name + " — joining them would change which one runs");
      seen.set(st.id.name, { file: it.name, body });
    }
  }
}

function versionLocal(html) {
  return html.replace(/(\s(?:src|href)=")([^"#:]+?)(?:\?v=[^"]*)?"/g, (all, pre, url) => {
    if (/^(build\/|data:|https?:|\/\/)/.test(url)) return all;
    const f = path.join(ROOT, url);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return all;
    return pre + url + "?v=" + hash(fs.readFileSync(f)) + '"';
  });
}

/* The lazy manifest: who the core reaches in each group, each group's
   bundle, its deps; refuses what the core would read from a group by
   value, and dependency cycles. */
async function lazyGroups(core, lazy, srcName, base) {
  const groups = {};
  const coreRefs = new Set();
  core.forEach((it) => { it.info.globals.forEach((n) => coreRefs.add(n)); it.info.winGet.forEach((n) => coreRefs.add(n)); });
  const coreDecl = new Set(); core.forEach((it) => { it.info.decl.forEach((n) => coreDecl.add(n)); it.info.winSet.forEach((n) => coreDecl.add(n)); });
  const exportsOf = (items) => { const s = new Set(); items.forEach((it) => { it.info.decl.forEach((n) => s.add(n)); it.info.winSet.forEach((n) => s.add(n)); }); return s; };
  const problems = [];
  const order = [...lazy.keys()];
  for (const g of order) {
    const items = lazy.get(g);
    const ex = exportsOf(items);
    const comp = [], fn = [];
    for (const n of ex) {
      if (!coreRefs.has(n) || coreDecl.has(n) || LEAVE.has(n)) continue;
      if (FN_STUB.has(n)) fn.push(n);
      else if (/^[A-Z]/.test(n) && !/^[A-Z0-9_]+$/.test(n)) comp.push(n);
      else problems.push(g + ": the core reads " + n + " (from " + items.map((i) => i.name).join(", ") + ") — move it to a core script, guard it, or list it in FN_STUB/LEAVE");
    }
    const refs = new Set(); items.forEach((it) => { it.info.globals.forEach((n) => refs.add(n)); it.info.winGet.forEach((n) => refs.add(n)); });
    const ownDecl = exportsOf(items);
    const deps = order.filter((h) => h !== g && [...exportsOf(lazy.get(h))].some((n) => refs.has(n) && !coreDecl.has(n) && !ownDecl.has(n) && !LEAVE.has(n)));
    const holds = [...new Set(items.flatMap((it) => it.info.holds))];
    const out = await bundle(items, base + "." + g + ".js");
    groups[g] = { src: out.file + "?v=" + out.v, deps, names: { comp: comp.sort(), fn: fn.sort() }, hold: holds, files: items.map((i) => i.name), bytes: out.bytes };
  }
  if (problems.length) throw new Error("build.js: " + srcName + "\n  " + problems.join("\n  "));
  // dependency cycles would deadlock load(); refuse them
  const visit = (g, stack) => { if (stack.includes(g)) throw new Error("build.js: lazy groups depend on each other in a cycle: " + stack.concat(g).join(" → ")); groups[g].deps.forEach((d) => visit(d, stack.concat(g))); };
  Object.keys(groups).forEach((g) => visit(g, []));
  return groups;
}
const lazyManifest = (groups) => ({ groups: Object.fromEntries(Object.entries(groups).map(([g, d]) => [g, { src: d.src, deps: d.deps, names: d.names, hold: d.hold }])) });

async function buildPage(srcName, outName) {
  const base = outName.replace(/\.html$/, "");
  let html = fs.readFileSync(path.join(ROOT, srcName), "utf8");
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const core = [], lazy = new Map(); // group -> items
  let inline = 0, firstBabel = null;
  const edits = [];
  for (const m of tags) {
    const attrs = m[1];
    const type = (attrs.match(/\btype="([^"]*)"/) || [])[1];
    const src = (attrs.match(/\bsrc="([^"?]*)/) || [])[1];
    if (src && /unpkg\.com\/@babel\/standalone/.test(src)) { edits.push([m[0], ""]); continue; }
    if (src && /react(-dom)?\.development\.js$/.test(src)) { edits.push([m[0], m[0].replace(".development.js", ".production.min.js")]); continue; }
    if (type !== "text/babel" && type !== "text/jsx") continue;
    if (/data-(presets|plugins|type)=/.test(attrs)) throw new Error("build.js: " + srcName + " uses data-presets/plugins/type — add them to BABEL_OPTS first");
    const group = (attrs.match(/\bdata-lazy="([^"]+)"/) || [])[1];
    const item = src ? compile(fs.readFileSync(path.join(ROOT, src), "utf8"), src) : compile(m[2], base + ".inline-" + (++inline) + ".js");
    if (group) { if (!lazy.has(group)) lazy.set(group, []); lazy.get(group).push(item); } else core.push(item);
    edits.push([m[0], firstBabel ? "" : "@@CORE@@"]);
    if (!firstBabel) firstBabel = m[0];
  }
  for (const [from, to] of edits) html = html.replace(from + "\n", to ? to + "\n" : "").replace(from, to);

  checkJoin(core);
  const coreOut = await bundle(core, base + ".core.js");

  const groups = await lazyGroups(core, lazy, srcName, base);
  const order = Object.keys(groups);

  html = html.replace("@@CORE@@", '<script defer src="' + coreOut.file + "?v=" + coreOut.v + '"></script>');
  if (order.length) {
    const lazyTag = html.match(/<script src="needt-lazy\.js[^"]*"><\/script>/);
    if (!lazyTag) throw new Error("build.js: " + srcName + " has data-lazy scripts but does not load needt-lazy.js");
    html = html.replace(lazyTag[0], "<script>window.__NEEDT_LAZY=" + JSON.stringify(lazyManifest(groups)) + ";</script>\n" + lazyTag[0]);
  }
  html = html.replace(/<!-- SOURCE PAGE\.[\s\S]*?-->/, "<!-- GENERATED by build.js from " + srcName + " — do not edit; edit " + srcName + " and the sources, then run `node build.js`. -->");
  html = versionLocal(html);
  fs.writeFileSync(path.join(ROOT, outName), html);
  return { outName, core: core.length, coreBytes: coreOut.bytes, groups };
}

/* ---- app.html: the one program (09.10.26) ----
   app-dev.html loads the shared base (React, the DS bundle, cssvar, sync,
   platform, Data, brand-icons) and app-boot.js, which picks a UI and loads
   that UI's styles and scripts as listed in index-dev.html (desktop) or
   mobile-dev.html (phone). Here the same lists become:
     build/app.desktop.js       the desktop core, index order
     build/app.desktop.only.js  the same minus what the phone core ran
     build/app.phone.js         the phone core, mobile order
     build/app.phone.only.js    the same minus what the desktop core ran
     build/app.<group>.js       the desktop's lazy groups (needt-lazy.js)
   A desktop lazy file the phone core also needs (paywall-sheet,
   ExposureWordmark, Habits) is desktop core here, so no file can run twice
   whichever UI comes first. Inline scripts of the two pages are not part of
   the program. The manifest (window.__NEEDT_APP) is written into app.html. */
function pageParts(srcName) {
  const html = fs.readFileSync(path.join(ROOT, srcName), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const css = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  const babel = [], plain = [];
  for (const m of html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/g)) {
    const attrs = m[1];
    const type = (attrs.match(/\btype="([^"]*)"/) || [])[1];
    const src = (attrs.match(/\bsrc="([^"?]*)/) || [])[1];
    if (!src || /^(https?:|\/\/)/.test(src) || type === "module") continue;
    if (type === "text/babel" || type === "text/jsx") babel.push({ src, lazy: (attrs.match(/\bdata-lazy="([^"]+)"/) || [])[1] || null });
    else plain.push(src);
  }
  return { css, babel, plain };
}
const withHash = (url) => {
  const u = url.split("?")[0];
  if (/^(build\/|data:|https?:|\/\/)/.test(u)) return url;
  const f = path.join(ROOT, u);
  return fs.existsSync(f) && fs.statSync(f).isFile() ? u + "?v=" + hash(fs.readFileSync(f)) : url;
};
async function buildApp(srcName, outName) {
  const base = outName.replace(/\.html$/, "");
  let html = fs.readFileSync(path.join(ROOT, srcName), "utf8");
  const D = pageParts("index-dev.html"), Ph = pageParts("mobile-dev.html");
  const item = (src) => compile(fs.readFileSync(path.join(ROOT, src), "utf8"), src);
  const phoneFiles = new Set(Ph.babel.map((b) => b.src));
  const deskCore = [], deskLazy = new Map();
  for (const b of D.babel) {
    if (!b.lazy || phoneFiles.has(b.src)) deskCore.push(item(b.src));
    else { if (!deskLazy.has(b.lazy)) deskLazy.set(b.lazy, []); deskLazy.get(b.lazy).push(item(b.src)); }
  }
  const phoneCore = Ph.babel.map((b) => item(b.src));
  const deskNames = new Set(deskCore.map((i) => i.name));
  const deskOnly = deskCore.filter((i) => !phoneFiles.has(i.name));
  const phoneOnly = phoneCore.filter((i) => !deskNames.has(i.name));
  checkJoin(deskCore); checkJoin(phoneCore);
  const warn = [];
  try { checkJoin(deskCore.concat(phoneOnly)); } catch (e) { warn.push("after a switch both UIs are loaded: " + e.message.replace(/^build\.js: /, "")); }
  const out = {
    "desktop": await bundle(deskCore, base + ".desktop.js"),
    "desktop.only": await bundle(deskOnly, base + ".desktop.only.js"),
    "phone": await bundle(phoneCore, base + ".phone.js"),
    "phone.only": await bundle(phoneOnly, base + ".phone.only.js")
  };
  const groups = await lazyGroups(deskCore, deskLazy, srcName, base);
  /* A stand-in replaces a global of the same name; none may be one the phone declares. */
  const phoneDecl = new Set(); phoneCore.forEach((it) => it.info.decl.forEach((n) => phoneDecl.add(n)));
  Object.entries(groups).forEach(([g, d]) => d.names.comp.concat(d.names.fn).forEach((n) => { if (phoneDecl.has(n)) warn.push("lazy " + g + ": stand-in " + n + " shadows the phone's own " + n); }));

  const own = new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"?]*)/g)].map((m) => m[1]));
  const pre = (P) => P.plain.filter((s) => !own.has(s)).map(withHash);
  const src = (o) => o.file + "?v=" + o.v;
  const manifest = { ui: {
    desktop: { css: D.css.map(withHash), pre: pre(D), full: src(out.desktop), only: src(out["desktop.only"]), lazy: Object.keys(groups).length ? lazyManifest(groups) : null },
    phone: { css: Ph.css.map(withHash), pre: pre(Ph), full: src(out.phone), only: src(out["phone.only"]), lazy: null }
  } };
  if (manifest.ui.desktop.lazy && !manifest.ui.desktop.pre.some((s) => /^needt-lazy\.js/.test(s))) throw new Error("build.js: index-dev.html has data-lazy scripts but does not load needt-lazy.js");

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>\n?/g)) {
    const s = (m[1].match(/\bsrc="([^"?]*)/) || [])[1];
    if (s && /unpkg\.com\/@babel\/standalone/.test(s)) html = html.replace(m[0], "");
    else if (s && /react(-dom)?\.development\.js$/.test(s)) html = html.replace(m[0], m[0].replace(".development.js", ".production.min.js"));
  }
  const boot = html.match(/<script src="app-boot\.js[^"]*"><\/script>/);
  if (!boot) throw new Error("build.js: " + srcName + " does not load app-boot.js");
  html = html.replace(boot[0], "<script>window.__NEEDT_APP=" + JSON.stringify(manifest) + ";</script>\n" + boot[0]);
  html = html.replace(/<!-- SOURCE PAGE\.[\s\S]*?-->/, "<!-- GENERATED by build.js from " + srcName + " — do not edit; edit " + srcName + " and the sources, then run `node build.js`. -->");
  html = versionLocal(html);
  fs.writeFileSync(path.join(ROOT, outName), html);
  return { outName, out, groups, warn, deskCore: deskCore.length, phoneCore: phoneCore.length, deskOnly: deskOnly.length, phoneOnly: phoneOnly.length };
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  for (const [src, out] of PAGES) {
    const r = await buildPage(src, out);
    console.log(out + ": core " + r.core + " scripts, " + Math.round(r.coreBytes / 1024) + " KB" +
      Object.entries(r.groups).map(([g, d]) => "\n  lazy " + g + ": " + d.files.join(" + ") + " (" + Math.round(d.bytes / 1024) + " KB)" +
        (d.deps.length ? " deps " + d.deps.join(",") : "") + (d.names.comp.length ? " · stand-ins " + d.names.comp.join(" ") : "") +
        (d.names.fn.length ? " · calls " + d.names.fn.join(" ") : "") + (d.hold.length ? " · holds " + d.hold.join(" ") : "")).join(""));
  }
  const a = await buildApp("app-dev.html", "app.html");
  const kb = (o) => Math.round(o.bytes / 1024) + " KB";
  console.log("app.html: desktop " + a.deskCore + " scripts " + kb(a.out.desktop) + " (after the phone: " + a.deskOnly + ", " + kb(a.out["desktop.only"]) + ")" +
    " · phone " + a.phoneCore + " scripts " + kb(a.out.phone) + " (after the desktop: " + a.phoneOnly + ", " + kb(a.out["phone.only"]) + ")" +
    " · lazy " + Object.keys(a.groups).join(" ") + a.warn.map((w) => "\n  warning: " + w).join(""));
  console.log("built in " + ((Date.now() - t0) / 1000).toFixed(1) + " s" + (MINIFY ? "" : " (not minified)"));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
