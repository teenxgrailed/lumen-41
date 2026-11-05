import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { signInAs } from "../../../../../../../home/user/wt-map/tests/helpers/v3-user";
// usage: capture.ts <dir> <name> <w> <h> <seconds>
(async () => {
  const [S, name, w, h, secs] = process.argv.slice(2);
  const W = +w, H = +h, N = Math.round(+secs * 30);
  const out = `${S}/${name}`; mkdirSync(out, { recursive: true });
  const u = JSON.parse(readFileSync(S + "/user.json", "utf8"));
  const b = await chromium.launch({ args: ["--disable-gpu-vsync"] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, reducedMotion: "no-preference", baseURL: process.env.TEST_BASE_URL });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("needt:agents-onboarded", "1"));
  // The control bar is UI chrome for the promo: hidden, the map and pills stay.
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = ".ag-map-bar{visibility:hidden!important}*{cursor:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  // The faked rAF passes a timestamp on another base than performance.now();
  // the map compares the two, so hand it performance.now().
  await page.clock.install();
  // performance.now() is not faked: tie it to the faked Date, and give rAF
  // callbacks that same clock.
  await page.addInitScript(() => {
    const base = Date.now();
    performance.now = () => Date.now() - base;
    document.addEventListener("DOMContentLoaded", () => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
    });
  });
  await signInAs(page, u);
  await page.goto("/agents", { waitUntil: "domcontentloaded", timeout: 240000 });
  for (let i = 0; i < 600; i++) {
    if (await page.$("[data-ag-map-full]")) break;
    await page.clock.runFor(250); await page.waitForTimeout(100);
  }
  await page.clock.runFor(2000); await page.waitForTimeout(500);
  const jsClick = (sel: string) => page.$eval(sel, (e) => (e as HTMLElement).click());
  await jsClick("[data-ag-map-full]");
  for (let i = 0; i < 10; i++) { await page.clock.runFor(100); await page.waitForTimeout(100); }
  await jsClick("[data-ag-map-presentation]");
  await page.clock.runFor(500); await page.waitForTimeout(300);
  await jsClick("[data-ag-map-shuffle]");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(800);
  console.log("full:", await page.$eval("[data-ag-map]", (e) => e.className), "pres:", await page.$eval("[data-ag-map-presentation]", (e) => e.getAttribute("aria-pressed")));
  for (let i = 0; i < N; i++) {
    await page.screenshot({ path: `${out}/f${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 95 });
    await page.clock.runFor(1000 / 30);
  }
  await b.close();
})();
