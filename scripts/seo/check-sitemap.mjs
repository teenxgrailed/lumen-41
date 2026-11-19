#!/usr/bin/env node
// Sitemap gate: every URL a sitemap lists must be worth indexing.
//
//   node scripts/seo/check-sitemap.mjs https://needt.app/sitemap.xml
//   node scripts/seo/check-sitemap.mjs --dir landing-site [--base https://needt.app]
//
// URL mode fetches each URL without following redirects. Dir mode reads the
// built files (what nginx serves: <path>/index.html) and also checks that every
// internal link points at a file directly, so no link needs a redirect.
// Fails (exit 1) when a listed URL: is not HTTP 200, redirects, has noindex
// (meta robots or X-Robots-Tag), or declares a canonical that is not itself.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const baseAt = args.indexOf("--base");
const dir = dirAt >= 0 ? args[dirAt + 1] : null;
const base = baseAt >= 0 ? args[baseAt + 1] : "https://needt.app";
const sitemapUrl = args.find(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--dir" && args[i - 1] !== "--base"
);

const problems = [];
const fail = (url, why) => problems.push(`${url}  ${why}`);

export function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
}
export function metaNoindex(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some(
    (m) => /name=["'](?:robots|googlebot)["']/i.test(m[0]) && /noindex/i.test(m[0])
  );
}
export function canonicalOf(html) {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel=["']canonical["']/i.test(m[0])) {
      return (m[0].match(/href=["']([^"']*)["']/i) || [])[1] ?? "";
    }
  }
  return null;
}
function inspect(url, html, headers) {
  if (headers && /noindex/i.test(headers.get("x-robots-tag") || "")) {
    fail(url, "X-Robots-Tag noindex");
  }
  if (metaNoindex(html)) fail(url, "meta robots noindex");
  const c = canonicalOf(html);
  if (c !== null && c !== url) fail(url, `canonical is ${c}`);
}

async function urlMode() {
  const res = await fetch(sitemapUrl, { redirect: "manual" });
  if (res.status !== 200) {
    fail(sitemapUrl, `sitemap itself answers HTTP ${res.status}`);
    return;
  }
  const urls = locs(await res.text());
  if (!urls.length) fail(sitemapUrl, "sitemap lists no URLs");
  for (const url of urls) {
    const r = await fetch(url, { redirect: "manual" });
    if (r.status !== 200) {
      const to = r.headers.get("location");
      fail(url, `HTTP ${r.status}${to ? ` -> ${to}` : ""}`);
      continue;
    }
    inspect(url, await r.text(), r.headers);
  }
  console.log(`checked ${urls.length} URLs from ${sitemapUrl}`);
}

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith(".html")) out.push(p);
  }
  return out;
}

function dirMode() {
  const urls = locs(readFileSync(join(dir, "sitemap.xml"), "utf8"));
  if (!urls.length) fail("sitemap.xml", "lists no URLs");
  const seen = new Set();
  for (const url of urls) {
    if (seen.has(url)) fail(url, "listed twice");
    seen.add(url);
    if (!url.startsWith(base)) {
      fail(url, `not on ${base}`);
      continue;
    }
    const path = url.slice(base.length).split("?")[0];
    if (!path.endsWith("/")) {
      fail(url, "no trailing slash (nginx would redirect)");
      continue;
    }
    const file = join(dir, path, "index.html");
    if (!existsSync(file)) {
      fail(url, "no such page");
      continue;
    }
    inspect(url, readFileSync(file, "utf8"), null);
  }
  const pages = walk(dir);
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/<a\b[^>]*\shref=["']([^"'#]*)/gi)) {
      const raw = m[1].split("?")[0];
      if (!raw || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
      const target = raw.startsWith("/")
        ? normalize(join(dir, raw))
        : normalize(join(dirname(file), raw));
      const here = file.slice(dir.length + 1);
      if (existsSync(target) && statSync(target).isDirectory() && !raw.endsWith("/")) {
        fail(here, `link ${raw} needs a redirect (add a trailing slash)`);
      } else if (!existsSync(target) && !existsSync(join(target, "index.html"))) {
        fail(here, `link ${raw} points at nothing`);
      }
    }
  }
  console.log(`checked ${urls.length} URLs and the links on ${pages.length} pages in ${dir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!dir && !sitemapUrl) {
    console.error("usage: check-sitemap.mjs <sitemap-url> | --dir <folder> [--base <origin>]");
    process.exit(2);
  }
  await (dir ? dirMode() : urlMode());
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.map((p) => "  " + p).join("\n")}`);
    process.exit(1);
  }
  console.log("ok");
}
