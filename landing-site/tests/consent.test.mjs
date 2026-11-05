// Run: node --test landing-site/tests/consent.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "tests" || name === "node_modules" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const pages = htmlFiles(root);
const rel = (p) => p.slice(root.length + 1);

test("there are pages to check", () => {
  assert.ok(pages.length >= 100, `found ${pages.length}`);
});

test("every page loads the consent script and styles, and has the footer link", () => {
  for (const p of pages) {
    const s = readFileSync(p, "utf8");
    assert.match(s, /<script src="[^"]*consent\.js\?v=\d+" data-umami-id="[^"]*" defer><\/script>/, `${rel(p)}: consent.js`);
    assert.match(s, /<link rel="stylesheet" href="[^"]*consent\.css\?v=\d+">/, `${rel(p)}: consent.css`);
    assert.equal((s.match(/data-cookie-settings/g) || []).length, 1, `${rel(p)}: one Cookie settings link`);
    assert.match(s, /<span class="fh">Legal<\/span>.*?data-cookie-settings>Cookie settings<\/a><\/div>/s, `${rel(p)}: link inside the Legal column`);
  }
});

test("no page loads Umami directly, only the consent script may", () => {
  for (const p of pages) {
    const s = readFileSync(p, "utf8");
    assert.ok(!s.includes("stats.needt.app/script.js"), `${rel(p)} references the Umami script`);
  }
  const consent = readFileSync(join(root, "consent.js"), "utf8");
  assert.ok(consent.includes("stats.needt.app/script.js"));
  // the Umami tag is created inside loadAnalytics, which only runs on accept or on a saved accept
  assert.match(consent, /if \(value === "accepted"\) \{[^}]*loadAnalytics\(\)/s);
  assert.match(consent, /if \(v === "accepted"\) \{[^}]*loadAnalytics\(\)/s);
});

test("the cookie is first-party, shared across .needt.app, Lax, Secure, 180 days", () => {
  const consent = readFileSync(join(root, "consent.js"), "utf8");
  assert.ok(consent.includes('"needt_consent"'));
  assert.ok(consent.includes("MAX_AGE = 15552000"));
  assert.ok(consent.includes("SameSite=Lax"));
  assert.ok(consent.includes("Domain=.needt.app; Secure"));
});

test("every umami.track call is behind the consent check", () => {
  for (const f of ["app.js", "site.js", "index.html", "index-b.html"]) {
    const lines = readFileSync(join(root, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/umami\.track\(/.test(line) && !/^\s*(\/\*|\/\/)/.test(line)) {
        assert.match(line, /NeedtConsent/, `${f}:${i + 1} calls umami.track without the consent check`);
      }
    });
  }
});

test("the banner has two equal buttons and a privacy link", () => {
  const consent = readFileSync(join(root, "consent.js"), "utf8");
  const btns = [...consent.matchAll(/<button type="button" class="([^"]+)" data-cc="(\w+)">/g)];
  assert.equal(btns.length, 2);
  assert.equal(btns[0][1], btns[1][1], "Accept and Decline share one class list");
  assert.deepEqual(btns.map((b) => b[2]).sort(), ["accepted", "declined"]);
  assert.ok(consent.includes("https://use.needt.app/privacy"));
  assert.ok(consent.includes('aria-label", "Cookie consent"'));
});

test("a saved choice re-syncs umami.disabled, and a malformed cookie is no choice", () => {
  const consent = readFileSync(join(root, "consent.js"), "utf8");
  assert.match(consent, /if \(v === "accepted"\) \{\s*setUmamiDisabled\(false\);\s*loadAnalytics\(\);/);
  assert.match(consent, /else if \(v === "declined"\) setUmamiDisabled\(true\)/);
  assert.match(consent, /try \{\s*v = m \? decodeURIComponent\(m\[1\]\) : "";\s*\} catch/);
});

test("the Dockerfile fills the placeholder in every page and checks the count", () => {
  const d = readFileSync(join(root, "..", "docker", "landing", "Dockerfile"), "utf8");
  assert.ok(d.includes("s/__UMAMI_SITE_ID__/$UMAMI_SITE_ID/g"));
  assert.ok(!d.includes("Analytics (Umami"), "old uncomment step is gone");
  assert.ok(d.includes('data-umami-id=\\"$UMAMI_SITE_ID\\"'));
  assert.ok(d.includes('"$N" -ne "$PAGES"'));
});
