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
const VARIANTS: Record<string, string> = {
  asis: "",
  frostNoFilterWhileMoving:
    ".pk-sheet-layer[data-pk-sheet-moving] .pk-sheet-frost{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;visibility:hidden}",
  noTransitions:
    ".pk-sheet-solid,.pk-sheet-frost,.pk-scrim.is-static-blur>.pk-scrim-blur{transition:none!important}",
  scrimPerFrame:
    ".pk-scrim.is-static-blur>.pk-scrim-blur{opacity:var(--pk-scrim-k)!important;transition:none!important}",
  noScrimBlur: ".pk-scrim-blur{display:none!important}",
  noSheetLayers: ".pk-sheet-solid,.pk-sheet-frost{display:none!important}",
};

type Sample = {
  run: number;
  frames: number;
  slowFrames: number;
  worstFrameMs: number;
  longTasks: number;
  longTaskMs: number;
};

test("composer sheet rise variants", async ({ browser }) => {
  test.setTimeout(600_000);
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

  const results: Record<string, unknown> = {};
  for (const [vname, css] of Object.entries(VARIANTS)) {
    const handle = await page.addStyleTag({ content: css });
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
    await handle.evaluate((n) => (n as unknown as Element).remove());
    const avg0 = (k: keyof Sample) =>
      Math.round(
        (samples.slice(1).reduce((a, x) => a + x[k], 0) / (RUNS - 1)) * 10
      ) / 10;
    results[vname] = {
      slow: avg0("slowFrames"),
      worst: avg0("worstFrameMs"),
      frames: avg0("frames"),
      samples: samples.map((x) => [x.frames, x.slowFrames, x.worstFrameMs]),
    };
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await mkdir(OUT, { recursive: true });
  await writeFile(
    path.join(OUT, "variants.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("PHONE_SHEET_VARIANTS " + JSON.stringify(results));
  expect(Object.keys(results).length).toBe(6);
});
