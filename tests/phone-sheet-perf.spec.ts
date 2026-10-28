import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Phone sheet rise, measured. Not an assertion on speed (a CI runner is a
 * software rasteriser, so absolute numbers mean little): it records, under a 4x
 * CPU throttle at an iPhone viewport, how many main-thread long tasks, how much
 * blocked time and how many slow frames the composer sheet's first (cold) and
 * later (warm) opening costs, so one run can be compared with another.
 * The numbers are written to test-results/phone-sheet-perf (uploaded with the
 * e2e report) and printed.
 */
const OUT = path.join("test-results", "phone-sheet-perf");
const RUNS = 5;

type Sample = {
  run: number;
  frames: number;
  slowFrames: number;
  worstFrameMs: number;
  longTasks: number;
  longTaskMs: number;
};

test("composer sheet rise under a 4x CPU throttle", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const user = await createV3User("phone-sheet-perf");
  await signInAs(page, user);
  await context.addCookies([
    {
      name: "needt-ui",
      value: "phone",
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/today");
  await page.locator('.needt-v3[data-ui="phone"]').waitFor();
  await page.locator("[data-nva-ready]").first().waitFor({ state: "attached" });
  await expect(page.locator(".nva-add")).toBeVisible({ timeout: 30_000 });
  // let the idle work of the first paint (prefetches, prewarm) finish
  await page.waitForTimeout(6000);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const samples: Sample[] = [];
  for (let run = 0; run < RUNS; run++) {
    await page.evaluate(() => {
      const w = window as unknown as { __perf: Record<string, unknown> };
      const frames: number[] = [];
      const longs: number[] = [];
      let last = 0;
      let on = true;
      const po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) longs.push(e.duration);
      });
      try {
        po.observe({ entryTypes: ["longtask"] });
      } catch {
        /* no longtask support */
      }
      const tick = (t: number) => {
        if (last) frames.push(t - last);
        last = t;
        if (on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      w.__perf = {
        frames,
        longs,
        stop: () => {
          on = false;
          po.disconnect();
        },
      };
    });
    await page.locator(".nva-add").tap();
    await page.locator(".pk-sheet-layer.is-open").waitFor();
    await page.waitForTimeout(1400);
    const s = await page.evaluate(() => {
      const p = (
        window as unknown as {
          __perf: {
            frames: number[];
            longs: number[];
            stop: () => void;
          };
        }
      ).__perf;
      p.stop();
      return {
        frames: p.frames.length,
        slowFrames: p.frames.filter((d) => d > 25).length,
        worstFrameMs: Math.round(Math.max(0, ...p.frames)),
        longTasks: p.longs.length,
        longTaskMs: Math.round(p.longs.reduce((a, b) => a + b, 0)),
      };
    });
    samples.push({ run, ...s });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const avg = (k: keyof Sample, from: number) => {
    const xs = samples.slice(from).map((s) => s[k]);
    return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  };
  const summary = {
    cold: samples[0],
    warmAvg: {
      slowFrames: avg("slowFrames", 1),
      worstFrameMs: avg("worstFrameMs", 1),
      longTasks: avg("longTasks", 1),
      longTaskMs: avg("longTaskMs", 1),
    },
    samples,
  };
  await mkdir(OUT, { recursive: true });
  await writeFile(
    path.join(OUT, "composer.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log("PHONE_SHEET_PERF " + JSON.stringify(summary));
  expect(samples.length).toBe(RUNS);
});
