// Screens of the signed-in app for design review (.github/workflows/design-shots.yml).
// Desktop 1440x1000 and iPhone 390x844, one colour scheme per run, full page.
// A shot waits for the route to settle (network idle, no skeleton) plus a short pause;
// a screen that never settles is still shot, with a WARN line, so a review sees it.
//
//   node .github/design-shots/shots.mjs <cookie.txt> <outDir> <screens> <scheme>
//   screens: comma list of name=path, e.g. "home=/today,tasks=/tasks"
//
// Shooting mode (v2, 15.11.26, for the Gemini review):
// - the cookie banner is answered ("declined" consent cookie), so it never covers a screen;
// - /api/ai-settings answers hostedAvailable, so the "AI is temporarily unavailable" strip
//   (CI has no AI key) is not drawn;
// - the page's own scroll container is unrolled, so a shot holds the whole screen, not one
//   viewport; on the phone, fixed and sticky chrome (tab bar, header) is taken out of the
//   way so nothing sits on top of the content.
import fs from "node:fs";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const [cookieFile, out, screenList, scheme = "light"] = process.argv.slice(2);
const HOST = "http://127.0.0.1:3000";
const [cookieName, ...rest] = fs.readFileSync(cookieFile, "utf8").trim().split("=");
const cookie = { name: cookieName, value: rest.join("="), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" };
const screens = screenList.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
  const i = s.indexOf("=");
  const name = i < 0 ? s : s.slice(0, i);
  const route = i < 0 ? "/" + name : s.slice(i + 1);
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`bad screen name: ${name}`);
  if (!route.startsWith("/") || route.startsWith("//")) throw new Error(`route must start with one /: ${route}`);
  // Shot options in the fragment, joined by "&": bar=classic|float sets the phone's
  // bottom bar (prefs.barStyle) for this screen; chrome keeps the fixed layers (the
  // dock, a sheet, a full-screen setup) and shoots the viewport instead of unrolling
  // the page; wait=<css> waits for that element before the shot. The other parts are
  // the route's real #anchor and stay on it ("/settings#menu&chrome" opens Menu).
  const h = route.indexOf("#");
  const frag = h < 0 ? "" : route.slice(h + 1);
  const isOpt = (p) => p === "chrome" || p.startsWith("bar=") || p.startsWith("wait=");
  const parts = frag ? frag.split("&") : [];
  const opts = new URLSearchParams(parts.filter(isOpt).join("&"));
  const anchor = parts.filter((p) => !isOpt(p)).join("&");
  const bar = opts.get("bar");
  if (bar && bar !== "classic" && bar !== "float") throw new Error(`bad bar: ${bar}`);
  const path_ = h < 0 ? route : route.slice(0, h) + (anchor ? "#" + anchor : "");
  return { name, route: path_, bar, chrome: opts.has("chrome"), wait: opts.get("wait") };
});

const sizes = [
  { tag: "desktop", options: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 } },
  { tag: "phone", options: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
];

// Unroll the tallest inner scroll container (and its ancestors) so a full-page shot holds
// everything. On the phone, fixed chrome is hidden and sticky chrome made static.
async function unroll(page, phone) {
  return page.evaluate((phone) => {
    let best = null;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const extra = el.scrollHeight - el.clientHeight;
      if (extra > 40 && el.scrollHeight < 12000 && (!best || extra > best.scrollHeight - best.clientHeight)) best = el;
    }
    if (best) {
      for (let el = best; el && el !== document.documentElement; el = el.parentElement) {
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("height", "auto", "important");
        el.style.setProperty("max-height", "none", "important");
      }
      document.documentElement.style.setProperty("height", "auto", "important");
      document.body.style.setProperty("height", "auto", "important");
      document.body.style.setProperty("overflow", "visible", "important");
    }
    if (phone) {
      for (const el of document.querySelectorAll("body *")) {
        const pos = getComputedStyle(el).position;
        if (pos === "fixed") el.style.setProperty("display", "none", "important");
        else if (pos === "sticky") el.style.setProperty("position", "static", "important");
      }
    }
    return best ? best.scrollHeight : 0;
  }, phone);
}

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let warned = 0;
let signedOut = 0;
let failed = 0;
try {
  for (const size of sizes) {
    const ctx = await browser.newContext({ ...size.options, colorScheme: scheme, locale: "en-US", timezoneId: "Europe/Zurich" });
    await ctx.addCookies([cookie, { name: "needt_consent", value: "declined", domain: "127.0.0.1", path: "/", sameSite: "Lax" }]);
    await ctx.route("**/api/ai-settings", async (route) => {
      const res = await route.fetch();
      let body = {};
      try { body = await res.json(); } catch {}
      await route.fulfill({ response: res, json: { ...body, hostedAvailable: true } });
    });
    for (const s of screens) {
      // The CI user is shared by every screen: each screen sets its own bar style, and
      // one without #bar= removes it (null), so no screen inherits the last one's.
      const res = await ctx.request
        .patch(HOST + "/api/user-settings", { data: { prefs: { barStyle: s.bar ?? null } } })
        .catch((e) => ({ ok: () => false, status: () => e.message }));
      if (!res.ok()) { failed++; console.log("FAIL bar style not set", s.name, size.tag, res.status()); }
      const page = await ctx.newPage();
      const started = Date.now();
      await page.goto(HOST + s.route, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => console.log("WARN goto", s.name, e.message));
      if (page.url().includes("/auth/")) { signedOut++; console.log("FAIL signed out", s.name, size.tag, page.url()); }
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => console.log("WARN networkidle", s.name, size.tag));
      const settled = await page
        .waitForFunction(() => !document.querySelector('[data-skeleton],[aria-busy="true"],.animate-pulse'), null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!settled) { warned++; console.log("WARN still loading", s.name, size.tag); }
      if (s.wait) {
        const seen = await page.waitForSelector(s.wait, { state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
        if (!seen) { warned++; console.log("WARN never showed", s.wait, s.name, size.tag); }
      }
      await page.waitForTimeout(1200);
      const file = path.join(out, `${s.name}-${size.tag}.png`);
      if (s.chrome) {
        // fixed layers (the dock, a sheet, a full-screen setup) are the subject: shoot
        // the screen as a person sees it, nothing hidden or unrolled
        await page.screenshot({ path: file, timeout: 30_000 }).catch((err) => console.log("FAIL shot", s.name, size.tag, err.message.split("\n")[0]));
        console.log("shot", file, `${Date.now() - started}ms`, page.url().replace(HOST, ""), "viewport");
        await page.close();
        continue;
      }
      const grown = await unroll(page, size.tag === "phone");
      await page.waitForTimeout(500);
      // A very tall page (a 24-hour grid unrolled) can exceed what Chromium captures:
      // fall back to the viewport rather than lose the screen.
      try {
        await page.screenshot({ path: file, fullPage: true, timeout: 30_000 });
      } catch (e) {
        console.log("WARN full page failed, viewport shot", s.name, size.tag, e.message.split("\n")[0]);
        warned++;
        await page.reload({ waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: file }).catch((err) => console.log("FAIL shot", s.name, size.tag, err.message.split("\n")[0]));
      }
      console.log("shot", file, `${Date.now() - started}ms`, page.url().replace(HOST, ""), `unrolled ${grown}px`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`done, ${warned} screen(s) never settled`);
if (signedOut) { console.log(`${signedOut} shot(s) landed on the sign-in page: the session did not take`); process.exit(1); }
if (failed) { console.log(`${failed} screen(s) could not set the bottom bar style: their shots show the wrong bar`); process.exit(1); }
