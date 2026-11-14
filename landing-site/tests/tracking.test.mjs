// Run: node --test landing-site/tests/tracking.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, f), "utf8");

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

/** consent.js in a fake browser: a cookie jar, a page address, a recording Umami. */
function browser({ cookie = "", search = "" } = {}) {
  const calls = [];
  const listeners = {};
  const doc = {
    cookie,
    body: { insertBefore() {}, firstChild: null },
    head: { appendChild: (s) => { doc.script = s; } },
    currentScript: { getAttribute: () => "site-id" },
    querySelector: () => doc.script || null,
    querySelectorAll: () => [],
    createElement: () => ({
      setAttribute() {},
      addEventListener() {},
      classList: { add() {}, remove() {} },
      focus() {},
      offsetHeight: 0,
    }),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    documentElement: { classList: { add() {}, remove() {} }, style: { setProperty() {}, removeProperty() {} } },
  };
  const win = {
    document: doc,
    location: { hostname: "needt.app", protocol: "https:", search },
    localStorage: { setItem() {}, removeItem() {} },
    addEventListener() {},
    umami: undefined,
  };
  win.window = win;
  const ctx = vm.createContext({ ...win, document: doc, URL, URLSearchParams, requestAnimationFrame: (f) => f() });
  ctx.window = ctx;
  doc.currentScript = { getAttribute: () => "site-id" };
  vm.runInContext(read("consent.js"), ctx, { filename: "consent.js" });
  return { ctx, doc, calls, loadUmami: () => { ctx.umami = { track: (n, d) => calls.push([n, d]) }; doc.script?.onload?.(); } };
}

test("an event sent before Umami is ready is delivered when it loads", () => {
  const b = browser({ cookie: "needt_consent=accepted" });
  b.ctx.NeedtConsent.track("home_view", { variant: "a" });
  assert.deepEqual(b.calls, []);
  b.loadUmami();
  assert.deepEqual(b.calls, [["home_view", { variant: "a" }]]);
});

test("a visitor who has not answered yet is counted once they accept; one who declines is not", () => {
  const pending = browser();
  pending.ctx.NeedtConsent.track("home_view", { variant: "b" });
  pending.doc.cookie = "needt_consent=accepted";
  pending.ctx.umami = { track: (n) => pending.calls.push(n) };
  pending.ctx.NeedtConsent.track("signup_click", {});
  assert.deepEqual(pending.calls, ["home_view", "signup_click"]);

  const declined = browser({ cookie: "needt_consent=declined" });
  declined.ctx.NeedtConsent.track("home_view", {});
  declined.loadUmami();
  assert.deepEqual(declined.calls, []);
});

test("sign-up links open the create-account form and carry the utm tags", () => {
  const b = browser({ search: "?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=planner&utm_content=cta&x=1" });
  const url = new URL(b.ctx.NeedtConsent.signupUrl("https://use.needt.app/auth/signin"));
  assert.equal(url.searchParams.get("mode"), "signup");
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    assert.ok(url.searchParams.get(k), k);
  }
  assert.equal(url.searchParams.get("x"), null);
  assert.equal(b.ctx.NeedtConsent.signupUrl("https://use.needt.app/privacy"), "https://use.needt.app/privacy");
});

test("one event name for the want-app button", () => {
  for (const f of ["site.js", "app.js"]) assert.doesNotMatch(read(f), /["']want-app["']/, f);
  for (const p of htmlFiles(root)) assert.doesNotMatch(readFileSync(p, "utf8"), /track\("want-app"/, p);
});

test("home_view is sent from app.js for every page marked data-home, and no page repeats it", () => {
  assert.match(read("app.js"), /send\("home_view", \{ variant \}\)/);
  for (const p of htmlFiles(root)) {
    const s = readFileSync(p, "utf8");
    assert.doesNotMatch(s, /umami\.track\("home_view"/, p);
  }
  for (const home of ["index.html", "index-b.html"]) {
    assert.match(read(home), /<html[^>]* data-home="[ab]"/, home);
    assert.match(read(home), /<script src="app\.js\?v=\d+" defer><\/script>/, home);
  }
});
