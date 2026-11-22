#!/usr/bin/env node
// Dev-files gate: the deployed landing must not serve repo-only files.
//
//   node scripts/seo/check-dev-files.mjs [--dir landing-site]
//        [--nginx docker/landing/nginx.conf] [--dockerfile docker/landing/Dockerfile]
//
// landing-site/ holds the pages and, next to them, tests, notes, backups and a
// debug helper. Two layers keep those private: the Dockerfile deletes them from
// the image and nginx answers 404 for them. This script (no network, no docker)
// fails when
//   - nginx would not answer 404 for a dev file, in the tree or in the examples below
//     (it picks the location the way nginx does: exact, ^~ prefix, first matching
//     regex, longest prefix),
//   - the Dockerfile no longer deletes one of the dev-file kinds,
//   - nginx would 404 a file the site needs (any non-dev file in the tree), or
//   - a page links to a file that the deploy removes.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

// What counts as a dev file. `needle` is a literal the Dockerfile must contain
// (its delete step); `examples` are URLs nginx must 404 even if the tree has none.
export const DEV_RULES = [
  {
    name: "tests",
    is: (p) => p.startsWith("tests/"),
    needle: '"$H/tests"',
    examples: ["/tests/consent.test.mjs", "/tests/anything.html"],
  },
  {
    name: "parked fragments",
    is: (p) => p.startsWith("_archive/"),
    needle: '"$H/_archive"',
    examples: ["/_archive/sections/updates.html", "/_archive/README.md"],
  },
  {
    name: "edge-debug helper",
    is: (p) => p === "edge-debug.js",
    needle: '"$H/edge-debug.js"',
    examples: ["/edge-debug.js"],
  },
  {
    name: "notes (.md outside templates/)",
    is: (p) => /\.md$/i.test(p) && !p.startsWith("templates/"),
    needle: `-name '*.md' -not -path "$H/templates/*"`,
    examples: ["/README.md", "/NOTES.md", "/blog/NOTES.md", "/resources/mcp/README.md"],
  },
  {
    name: "leftovers (.orig .bak .old .tmp .swp .map .log .mjs)",
    is: (p) => /\.(?:orig|bak|old|tmp|swp|map|log|mjs)$/i.test(p),
    needle: "-name '*.orig'",
    examples: ["/styles.css.orig", "/app.js.bak", "/app.js.map", "/x/y.old", "/t.mjs"],
  },
  {
    name: "dot files (except .well-known/)",
    is: (p) => /(?:^|\/)\.(?!well-known\/)/.test(p),
    needle: "-name '.*' -not -name '.well-known'",
    examples: ["/.env", "/.git/config", "/blog/.DS_Store"],
  },
];
export const isDevFile = (rel) => DEV_RULES.some((r) => r.is(rel));

// URLs the site must keep serving, whatever the rules above say.
export const MUST_SERVE = [
  "/",
  "/404.html",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/.well-known/security.txt",
  "/templates/daily-planner/needt-daily-planner.csv",
  "/templates/daily-planner/needt-daily-planner.md",
  "/plugin/needt.plugin",
  "/app.js",
  "/styles.css",
];

// --- nginx: the blocks we need, and nginx's own location selection ----------
export function parseLocations(conf) {
  const text = conf.replace(/#[^\n]*/g, "");
  const out = [];
  for (const m of text.matchAll(/\blocation\s+(?:(=|\^~|~\*|~)\s+)?(\S+)\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(start, i - 1);
    out.push({
      mod: m[1] || "",
      pattern: m[2],
      deny: /(?:^|[;\s])return\s+404\s*;/.test(body),
      re: m[1] === "~" || m[1] === "~*" ? knownRegex(m[1], m[2]) : null,
    });
  }
  return out;
}

// The regex locations of docker/landing/nginx.conf as literal JS regexes, so
// this gate never compiles a pattern read from a file (semgrep:
// detect-non-literal-regexp). A new or changed regex location in the config
// fails the gate until it is added here.
const KNOWN_REGEX = new Map([
  ["~* ^/(?!templates/).*\\.md$", /^\/(?!templates\/).*\.md$/i],
  ["~* \\.(?:orig|bak|old|tmp|swp|map|log|mjs)$", /\.(?:orig|bak|old|tmp|swp|map|log|mjs)$/i],
  ["~ /\\.(?!well-known/)", /\/\.(?!well-known\/)/],
  ["~ ^/(privacy|terms)(?:/|/index\\.html)?$", /^\/(privacy|terms)(?:\/|\/index\.html)?$/],
  ["~ ^/refunds?(?:/|/index\\.html)?$", /^\/refunds?(?:\/|\/index\.html)?$/],
  ["~* \\.html$", /\.html$/i],
  // Used by the gate's own test (a deny rule that is too broad).
  ["~ \\.html$", /\.html$/],
  [
    "~* ^/(?:favicon\\.(?:ico|svg)|apple-touch-icon\\.png|icon-(?:48|96|192|512)\\.png|assets/(?:icon(?:-dark)?\\.svg|icon-(?:48|96|192|512)\\.png|favicon\\.ico|apple-touch-icon\\.png))$",
    /^\/(?:favicon\.(?:ico|svg)|apple-touch-icon\.png|icon-(?:48|96|192|512)\.png|assets\/(?:icon(?:-dark)?\.svg|icon-(?:48|96|192|512)\.png|favicon\.ico|apple-touch-icon\.png))$/i,
  ],
  ["~* ^/assets/og/[^/]+\\.jpg$", /^\/assets\/og\/[^/]+\.jpg$/i],
  ["~* \\.(?:csv|md|plugin)$", /\.(?:csv|md|plugin)$/i],
  ["~* \\.(?:css|js|svg|ico|png|jpg|jpeg|webp|woff2?)$", /\.(?:css|js|svg|ico|png|jpg|jpeg|webp|woff2?)$/i],
]);

export class UnknownRegexLocation extends Error {}

function knownRegex(mod, pattern) {
  const re = KNOWN_REGEX.get(`${mod} ${pattern}`);
  if (!re) {
    throw new UnknownRegexLocation(
      `nginx regex location "${mod} ${pattern}" is not in KNOWN_REGEX (scripts/seo/check-dev-files.mjs): add it as a literal`
    );
  }
  return re;
}

// The location nginx would pick for a URI path (decoded, no query).
export function pick(locations, uri) {
  const exact = locations.find((l) => l.mod === "=" && l.pattern === uri);
  if (exact) return exact;
  let best = null;
  for (const l of locations) {
    if ((l.mod === "" || l.mod === "^~") && uri.startsWith(l.pattern)) {
      if (!best || l.pattern.length > best.pattern.length) best = l;
    }
  }
  if (best && best.mod === "^~") return best;
  const hit = locations.find((l) => l.re && l.re.test(uri));
  return hit || best;
}

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function check({ dir, nginxFile, dockerFile }) {
  const problems = [];
  const fail = (what, why) => problems.push(`${what}  ${why}`);
  const locs = parseLocations(readFileSync(nginxFile, "utf8"));
  const docker = readFileSync(dockerFile, "utf8");
  const denied = (uri) => pick(locs, uri)?.deny === true;

  if (!locs.length) fail(nginxFile, "no location blocks found");

  // Layer 1: the Dockerfile deletes every kind of dev file.
  for (const r of DEV_RULES) {
    if (!docker.includes(r.needle)) fail(dockerFile, `does not delete ${r.name} (expected ${r.needle})`);
  }

  // Layer 2: nginx 404s every dev file, in the tree and in the examples.
  const files = walk(dir).map((f) => relative(dir, f).split("\\").join("/"));
  for (const rel of files) {
    if (isDevFile(rel) && !denied("/" + rel)) fail("/" + rel, "is a dev file but nginx would serve it");
  }
  for (const r of DEV_RULES) {
    for (const uri of r.examples) {
      if (!denied(uri)) fail(uri, `(${r.name}) nginx would not answer 404`);
    }
  }

  // Nothing the site needs may be blocked.
  for (const rel of files) {
    if (!isDevFile(rel) && denied("/" + rel)) fail("/" + rel, "is needed by the site but nginx answers 404");
  }
  for (const uri of MUST_SERVE) {
    if (denied(uri)) fail(uri, "must be served but nginx answers 404");
    if (isDevFile(uri.slice(1))) fail(uri, "must be served but the Dockerfile deletes it");
  }

  // No page may point at a file the deploy removes (or at nothing).
  const pages = files.filter((f) => f.endsWith(".html") && !f.startsWith("_archive/"));
  for (const rel of pages) {
    const html = readFileSync(join(dir, rel), "utf8");
    for (const m of html.matchAll(/\s(?:src|href|poster|data-src)=["']([^"'#?]+)/gi)) {
      const raw = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
      const target = normalize(raw.startsWith("/") ? join(dir, raw) : join(dirname(join(dir, rel)), raw));
      const t = relative(dir, target).split("\\").join("/");
      if (t.startsWith("..") || !existsSync(target) || statSync(target).isDirectory()) continue;
      if (isDevFile(t)) fail(rel, `links to ${raw}, a dev file the deploy removes`);
      else if (denied("/" + t)) fail(rel, `links to ${raw}, which nginx answers 404`);
    }
  }
  return { problems, files: files.length, pages: pages.length, dev: files.filter(isDevFile) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
  const res = check({
    dir: opt("--dir", "landing-site"),
    nginxFile: opt("--nginx", "docker/landing/nginx.conf"),
    dockerFile: opt("--dockerfile", "docker/landing/Dockerfile"),
  });
  console.log(
    `checked ${res.files} files and ${res.pages} pages; ${res.dev.length} dev files are removed and answer 404`
  );
  if (res.problems.length) {
    console.error(`\n${res.problems.length} problem(s):\n${res.problems.map((p) => "  " + p).join("\n")}`);
    process.exit(1);
  }
  console.log("ok");
}
