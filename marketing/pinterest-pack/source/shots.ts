/* Captures the product screens used by the Pinterest pack.
   Usage: npx tsx shots.ts <outDir> <user.json>  (ONLY=name,name to limit).
   Needs a dev server on TEST_BASE_URL and a seeded demo user. */
import { readFileSync, statSync } from "fs";
import { type BrowserContextOptions, chromium, devices } from "playwright";

import { signInAs } from "../../../tests/helpers/v3-user";

type Shot = {
  name: string;
  url: string;
  opts: BrowserContextOptions;
  wait: number;
  auth?: boolean;
};

(async () => {
  const [outDir, userFile] = process.argv.slice(2);
  const user = JSON.parse(readFileSync(userFile, "utf8"));
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  const browser = await chromium.launch();

  const shoot = async ({ name, url, opts, wait, auth = true }: Shot) => {
    const ctx = await browser.newContext({
      ...opts,
      baseURL: auth ? process.env.TEST_BASE_URL : undefined,
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date("2026-11-12T10:05:00+01:00"));
    await page.addInitScript((uid: string) => {
      try {
        localStorage.setItem("needt:agents-onboarded", "1");
        if (!location.search.includes("setup"))
          sessionStorage.setItem("needt.cnSetupSeen:" + uid, "skipped");
      } catch {}
    }, user.id);
    if (auth) await signInAs(page, user);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(wait);
    for (let i = 0; i < 60; i++) {
      const busy = await page
        .evaluate(
          () =>
            document.querySelectorAll(
              '[class*="skeleton"],[class*="Skeleton"],[class*="animate-pulse"],[aria-busy="true"]'
            ).length
        )
        .catch(() => 0);
      if (!busy) break;
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1500);
    if (!auth) {
      await page
        .getByRole("button", { name: "Decline" })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(1200);
    }
    await page.mouse.move(1, 1);
    await page.screenshot({ path: `${outDir}/raw/${name}.png` });
    await ctx.close();
  };

  const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
  const phone = { ...devices["iPhone 13"] };
  const shots: Shot[] = [
    {
      name: "land-desk",
      url: "https://needt.app/",
      opts: desk,
      wait: 5000,
      auth: false,
    },
    {
      name: "land-phone",
      url: "https://needt.app/",
      opts: phone,
      wait: 5000,
      auth: false,
    },
    { name: "today-desk", url: "/today", opts: desk, wait: 30000 },
    { name: "today-phone", url: "/today", opts: phone, wait: 12000 },
    { name: "agents-desk", url: "/agents?tab=agents", opts: desk, wait: 12000 },
    {
      name: "agents-phone",
      url: "/agents?tab=agents",
      opts: phone,
      wait: 12000,
    },
    { name: "connections-desk", url: "/connections", opts: desk, wait: 12000 },
    {
      name: "connections-phone",
      url: "/connections",
      opts: phone,
      wait: 12000,
    },
    { name: "calendar-desk", url: "/calendar", opts: desk, wait: 12000 },
    { name: "calendar-phone", url: "/calendar", opts: phone, wait: 15000 },
  ];

  for (const shot of shots) {
    if (only.length && !only.includes(shot.name)) continue;
    // The dev server restarts under memory pressure; a blank frame is retried.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await shoot(shot);
        if (statSync(`${outDir}/raw/${shot.name}.png`).size > 60000) break;
      } catch (error) {
        process.stdout.write(
          `retry ${shot.name}: ${String(error).slice(0, 120)}\n`
        );
      }
    }
  }
  await browser.close();
})();
