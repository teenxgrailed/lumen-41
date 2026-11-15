/**
 * Screenshots every rendered email preview (the .html files written by
 * scripts/render-emails.ts) at 600 and 390 px wide, light and dark.
 * Usage: node scripts/email-shots.mjs [emailsDir] [outDir]
 *   defaults: /tmp/needt-emails  ->  /tmp/needt-email-shots
 * Run by .github/workflows/email-shots.yml; nothing is sent.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const inDir = resolve(process.argv[2] ?? "/tmp/needt-emails");
const outDir = resolve(process.argv[3] ?? "/tmp/needt-email-shots");
mkdirSync(outDir, { recursive: true });

const files = readdirSync(inDir).filter((f) => f.endsWith(".html"));
const widths = [600, 390];
const schemes = ["light", "dark"];

const browser = await chromium.launch();
let count = 0;
for (const width of widths) {
  for (const colorScheme of schemes) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    for (const file of files) {
      await page.goto(pathToFileURL(join(inDir, file)).href, {
        waitUntil: "load",
      });
      const name = file.replace(/\.html$/, "");
      await page.screenshot({
        path: join(outDir, `${name}-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      count += 1;
    }
    await context.close();
  }
}
await browser.close();
process.stdout.write(`Wrote ${count} screenshots to ${outDir}\n`);
