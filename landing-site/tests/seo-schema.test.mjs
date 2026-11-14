import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");

function blocks(file) {
  const html = readFileSync(join(dir, file), "utf8");
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    out.push(JSON.parse(m[1]));
  }
  return { html, out };
}

for (const file of ["index.html", "index-b.html"]) {
  test(`${file}: WebSite schema`, () => {
    const { out } = blocks(file);
    const site = out.find((d) => d["@type"] === "WebSite");
    assert.ok(site, "WebSite block present");
    assert.equal(site.name, "Needt");
    assert.equal(site.url, "https://needt.app/");
    assert.deepEqual(site.alternateName, ["Needt app", "Needt App", "needtapp", "needt.app"]);
    assert.equal(site.publisher["@id"], "https://needt.app/#org");
    assert.ok(out.some((d) => d["@type"] === "SoftwareApplication"));
  });

  test(`${file}: Organization sameAs`, () => {
    const { out } = blocks(file);
    const org = out.find((d) => d["@type"] === "Organization");
    for (const u of [
      "https://github.com/teenxgrailed/needt-plugin",
      "https://cursor.directory/plugins/needt",
      "https://mcp.so/servers/needt-plugin",
      "https://www.claudecodeagents.com/mcp/needt",
      "https://www.getapp.com/all-software/a/needt/",
    ]) {
      assert.ok(org.sameAs.includes(u), u);
    }
    assert.equal(new Set(org.sameAs).size, org.sameAs.length, "no duplicates");
  });

  test(`${file}: plain what-is-Needt line`, () => {
    const { html } = blocks(file);
    assert.match(html, /<meta name="description" content="Needt is an AI day planner/);
    assert.match(html, /<meta name="description" content="[^"]*Needt app[^"]*"/);
    assert.match(html, /<meta property="og:description" content="Needt is an AI day planner/);
    assert.match(html, /<p class="lead[^>]*>Needt is an AI day planner/);
  });
}
