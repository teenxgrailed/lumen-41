// Screens of the signed-in app for design review (.github/workflows/design-shots.yml).
// Desktop 1440x1000 and iPhone 390x844, one colour scheme per run, full page.
// A shot waits for the route to settle (network idle, no skeleton) plus a short pause;
// a screen that never settles is still shot, with a WARN line, so a review sees it.
//
//   node .github/design-shots/shots.mjs <cookie.txt> <outDir> <screens> <scheme>
//   screens: comma list of name=path, e.g. "home=/today,tasks=/tasks"
import fs from "node:fs";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const [cookieFile, out, screenList, scheme = "light"] = process.argv.slice(2);
const HOST = "http://127.0.0.1:3000";
const [cookieName, ...rest] = fs.readFileSync(cookieFile, "utf8").trim().split("=");
const cookie = { name: cookieName, value: rest.join("="), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" };
const screens = screenList.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
  const [name, route] = s.split("=");
  return { name, route: route || "/" + name };
});

const sizes = [
  { tag: "desktop", options: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 } },
  { tag: "phone", options: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
];

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let warned = 0;
try {
  for (const size of sizes) {
    const ctx = await browser.newContext({ ...size.options, colorScheme: scheme, locale: "en-US", timezoneId: "Europe/Zurich" });
    await ctx.addCookies([cookie]);
    for (const s of screens) {
      const page = await ctx.newPage();
      const started = Date.now();
      await page.goto(HOST + s.route, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => console.log("WARN goto", s.name, e.message));
      // The first frames of a slow screen are part of the review: keep one.
      if (s.name === "loading") {
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, `${s.name}-${size.tag}.png`) });
        await page.close();
        continue;
      }
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => console.log("WARN networkidle", s.name, size.tag));
      const settled = await page
        .waitForFunction(() => !document.querySelector('[data-skeleton],[aria-busy="true"],.animate-pulse'), null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!settled) { warned++; console.log("WARN still loading", s.name, size.tag); }
      await page.waitForTimeout(1200);
      const file = path.join(out, `${s.name}-${size.tag}.png`);
      await page.screenshot({ path: file, fullPage: size.tag === "phone" });
      console.log("shot", file, `${Date.now() - started}ms`, page.url().replace(HOST, ""));
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`done, ${warned} screen(s) never settled`);
