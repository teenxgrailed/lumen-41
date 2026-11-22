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
function browser({ cookie = "", search = "", store = new Map() } = {}) {
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
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const ctx = vm.createContext({ ...win, sessionStorage, document: doc, URL, URLSearchParams, requestAnimationFrame: (f) => f() });
  ctx.window = ctx;
  doc.currentScript = { getAttribute: () => "site-id" };
  vm.runInContext(read("consent.js"), ctx, { filename: "consent.js" });
  return { ctx, doc, calls, listeners, loadUmami: () => { ctx.umami = { track: (n, d) => calls.push([n, d]) }; doc.script?.onload?.(); } };
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

test("utm tags survive landing -> pricing -> sign-in (the hero button goes through /pricing/)", () => {
  const tab = new Map(); // one tab's sessionStorage
  browser({ search: "?utm_source=newsletter&utm_campaign=launch", store: tab });
  const pricing = browser({ search: "", store: tab });
  const url = new URL(pricing.ctx.NeedtConsent.signupUrl("https://use.needt.app/auth/signin"));
  assert.equal(url.searchParams.get("mode"), "signup");
  assert.equal(url.searchParams.get("utm_source"), "newsletter");
  assert.equal(url.searchParams.get("utm_campaign"), "launch");
});

test("a tag in the address wins over a kept one, and a declined visitor keeps nothing", () => {
  const tab = new Map();
  browser({ search: "?utm_source=old", store: tab });
  const now = browser({ search: "?utm_source=new", store: tab });
  assert.equal(new URL(now.ctx.NeedtConsent.signupUrl("https://use.needt.app/auth/signin")).searchParams.get("utm_source"), "new");

  const declinedTab = new Map();
  browser({ cookie: "needt_consent=declined", search: "?utm_source=x", store: declinedTab });
  assert.equal(declinedTab.size, 0);
});

test("every .js-signup and .js-trial link goes to use.needt.app/auth/signin?mode=signup, with utm tags (14.11.2026)", () => {
  for (const f of ["app.js", "site.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /new URL\("pricing\/", ROOT\)/, `${f}: Try it free must not open Pricing`);
    const lines = src.split("\n").filter((l) => /const signupHref =|\$\$\("\.js-signup, \.js-trial, \[data-cta=signup\]"\)/.test(l));
    assert.equal(lines.length, 2, `${f}: signupHref and the .js-signup/.js-trial line`);
    for (const search of ["", "?utm_source=newsletter"]) {
      const b = browser({ search });
      const links = [{ href: "#" }, { href: "pricing/" }];
      assert.match(src, /\[data-cta=signup\]/, `${f}: selector marks sign-up CTAs explicitly`);
      const run = new Function("window", "$$", lines.join("\n"));
      run(b.ctx, () => links);
      for (const a of links) {
        const u = new URL(a.href);
        assert.equal(u.origin + u.pathname, "https://use.needt.app/auth/signin", f);
        assert.equal(u.searchParams.get("mode"), "signup", f);
        if (search) assert.equal(u.searchParams.get("utm_source"), "newsletter", f);
      }
    }
  }
});

test("static .js-signup hrefs point at sign-in, never at # or pricing", () => {
  for (const p of htmlFiles(root)) {
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/<a [^>]*class="[^"]*js-signup[^"]*"[^>]*>/g)) {
      assert.match(m[0], /href="https:\/\/use\.needt\.app\/auth\/signin"/, `${p}: ${m[0]}`);
    }
  }
});

test("login links stay plain, including 'Log in to the Needt app' (14.11.2026)", () => {
  const m = read("consent.js").match(/var LOGIN_TEXT = (\/.*\/i);/);
  assert.ok(m, "LOGIN_TEXT found");
  const re = new RegExp(m[1].slice(1, -2), "i");
  for (const t of ["Log in", "Login", "Sign in", "Log in to the Needt app", " log in "]) assert.ok(re.test(t), t);
  for (const t of ["Try it free", "Sign up", "Start free"]) assert.ok(!re.test(t), t);
});

test("every .js-signup anchor carries data-cta=\"signup\", whatever its label says (22.11.2026)", () => {
  for (const p of htmlFiles(root)) {
    if (p.includes("/_archive/")) continue;
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/<a [^>]*class="[^"]*js-signup[^"]*"[^>]*>/g)) {
      assert.match(m[0], /data-cta="signup"/, `${p}: ${m[0]}`);
    }
  }
});

test("a data-cta=signup link labelled 'Log in' still opens sign-up; a plain 'Log in' link stays plain", () => {
  const b = browser({ search: "?utm_source=ad" });
  const link = (attrs, text) => {
    const a = {
      attrs: { href: "https://use.needt.app/auth/signin", ...attrs },
      textContent: text,
      getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
      setAttribute(n, v) { this.attrs[n] = v; },
    };
    a.closest = (sel) => (sel === "a" ? a : null);
    return a;
  };
  const click = (a) => { for (const fn of b.listeners.click || []) fn({ target: a }); return new URL(a.attrs.href); };
  const cta = click(link({ "data-cta": "signup" }, "Log in"));
  assert.equal(cta.searchParams.get("mode"), "signup");
  assert.equal(cta.searchParams.get("utm_source"), "ad");
  const plain = click(link({}, "Log in"));
  assert.equal(plain.searchParams.get("mode"), null);
  assert.equal(plain.searchParams.get("utm_source"), "ad");
});
