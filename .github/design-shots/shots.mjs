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
  return { name, route };
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
      if (extra > 40 && (!best || extra > best.scrollHeight - best.clientHeight)) best = el;
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
      await page.waitForTimeout(1200);
      const grown = await unroll(page, size.tag === "phone");
      await page.waitForTimeout(500);
      const file = path.join(out, `${s.name}-${size.tag}.png`);
      await page.screenshot({ path: file, fullPage: true });
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
