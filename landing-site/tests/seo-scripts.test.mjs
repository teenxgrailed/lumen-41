// Unit tests for the scripts in scripts/seo/ that gate the landing in CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mainText } from "../../scripts/seo/sitemap-lastmod.mjs";
import { brandProblems, hreflangs } from "../../scripts/seo/check-sitemap.mjs";
import { check, isDevFile, parseLocations, pick } from "../../scripts/seo/check-dev-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("mainText: only the visible text of <main> counts", () => {
  const html = `<head><title>T</title></head><header>Nav</header>
    <main class="x"><h1>Hello&nbsp;<b>world</b></h1><script>var a=1</script>
    <style>p{}</style><svg><title>icon</title></svg>
    <a class="btn btn-primary" href="/x">Try it free</a><a href="/y">Read more</a></main>
    <footer>Foot</footer>`;
  assert.equal(mainText(html), "Hello world Read more");
});

test("mainText: markup and button-label changes do not change the text", () => {
  const a = `<main><p class="a">Same text</p><a class="btn" href="/a">Try it free</a></main>`;
  const b = `<main><p class="b" id="z">Same   text</p><a class="btn" href="/a">Log in</a></main>`;
  assert.equal(mainText(a), mainText(b));
  assert.notEqual(mainText(a), mainText(`<main><p>Other text</p></main>`));
});

test("mainText: without <main> the whole document is used", () => {
  assert.equal(mainText("<p>Just  text</p>"), "Just text");
});

const url = "https://needt.app/resources/mcp/";
const good = `<head><meta property="og:site_name" content="Needt">
  <link rel="alternate" hreflang="en" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}"></head>`;

test("hreflangs: reads lang -> href pairs from alternate links", () => {
  assert.deepEqual(hreflangs(good), { en: url, "x-default": url });
  assert.deepEqual(hreflangs(`<link rel="canonical" href="${url}">`), {});
  assert.deepEqual(hreflangs(`<link href="${url}" hreflang="en" rel="alternate">`), { en: url });
});

test("brandProblems: a page with both signals is clean", () => {
  assert.deepEqual(brandProblems(url, good), []);
});

test("brandProblems: names what is missing or wrong", () => {
  assert.deepEqual(brandProblems(url, good.replace('content="Needt"', 'content="Other"')), [
    "no og:site_name Needt",
  ]);
  assert.deepEqual(brandProblems(url, good.replace(`hreflang="x-default" href="${url}"`, "")), [
    "hreflang x-default is missing",
  ]);
  const wrong = good.replace(`hreflang="en" href="${url}"`, 'hreflang="en" href="https://needt.app/"');
  assert.deepEqual(brandProblems(url, wrong), ["hreflang en is https://needt.app/"]);
});

// --- scripts/seo/check-dev-files.mjs ---------------------------------------
const conf = readFileSync(join(root, "docker/landing/nginx.conf"), "utf8");
const locs = parseLocations(conf);

test("nginx: dev files answer 404, site files do not", () => {
  const denied = (u) => pick(locs, u)?.deny === true;
  for (const u of ["/README.md", "/tests/a.mjs", "/styles.css.orig", "/edge-debug.js", "/.env", "/x/NOTES.md"]) {
    assert.ok(denied(u), `${u} should be 404`);
  }
  for (const u of [
    "/", "/resources/mcp/", "/app.js", "/styles.css", "/.well-known/security.txt",
    "/templates/weekly-review/needt-weekly-review.md", "/templates/weekly-review/needt-weekly-review.csv",
    "/plugin/needt.plugin", "/robots.txt",
  ]) {
    assert.ok(!denied(u), `${u} should be served`);
  }
});

test("isDevFile: pages, assets and template downloads are not dev files", () => {
  for (const f of ["index.html", "assets/og/x.jpg", "templates/a/b.md", "templates/a/b.csv", ".well-known/security.txt"]) {
    assert.equal(isDevFile(f), false, f);
  }
  for (const f of ["README.md", "tests/x.test.mjs", "styles.css.orig", "edge-debug.js", "_archive/a.html"]) {
    assert.equal(isDevFile(f), true, f);
  }
});

test("check-dev-files: passes on the repo", () => {
  const res = check({
    dir: join(root, "landing-site"),
    nginxFile: join(root, "docker/landing/nginx.conf"),
    dockerFile: join(root, "docker/landing/Dockerfile"),
  });
  assert.deepEqual(res.problems, []);
});

test("check-dev-files: fails when nginx stops denying a dev file or the Dockerfile stops deleting it", () => {
  const tmp = mkdtempSync(join(tmpdir(), "devfiles-"));
  const site = join(tmp, "site");
  mkdirSync(join(site, "tests"), { recursive: true });
  writeFileSync(join(site, "index.html"), "<main>hi</main>");
  writeFileSync(join(site, "README.md"), "notes");
  writeFileSync(join(site, "tests", "a.test.mjs"), "");
  const dockerFile = join(root, "docker/landing/Dockerfile");

  const open = join(tmp, "open.conf");
  writeFileSync(open, "server { location / { try_files $uri =404; } }");
  const r1 = check({ dir: site, nginxFile: open, dockerFile });
  assert.ok(r1.problems.some((p) => p.startsWith("/README.md")));
  assert.ok(r1.problems.some((p) => p.startsWith("/tests/a.test.mjs")));

  const noDelete = join(tmp, "Dockerfile");
  writeFileSync(noDelete, "FROM nginx\nRUN true\n");
  const r2 = check({ dir: site, nginxFile: join(root, "docker/landing/nginx.conf"), dockerFile: noDelete });
  assert.ok(r2.problems.some((p) => p.includes("does not delete tests")));

  // A deny rule that is too broad (blocks a page) is caught too.
  const broad = join(tmp, "broad.conf");
  writeFileSync(broad, "server { location ~ \\.html$ { return 404; } location / { } }");
  const r3 = check({ dir: site, nginxFile: broad, dockerFile });
  assert.ok(r3.problems.some((p) => p.includes("is needed by the site but nginx answers 404")));
});

test("check-dev-files: an nginx regex location it does not know fails the gate", async () => {
  const { UnknownRegexLocation } = await import("../../scripts/seo/check-dev-files.mjs");
  const tmp = mkdtempSync(join(tmpdir(), "devfiles-"));
  const site = join(tmp, "site");
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, "index.html"), "<main>hi</main>");
  const conf = join(tmp, "new.conf");
  writeFileSync(conf, "server { location ~ ^/new$ { return 404; } location / { } }");
  assert.throws(
    () => check({ dir: site, nginxFile: conf, dockerFile: join(root, "docker/landing/Dockerfile") }),
    UnknownRegexLocation
  );
});
