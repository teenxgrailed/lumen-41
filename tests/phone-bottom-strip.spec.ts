import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The strip under the dock: with a 34 px home-indicator inset emulated, the
 * bottom rows of the display, left of the dock, wear the ground with no seam,
 * in both themes; the fog's dots, when shown, reach to within 20 px of the
 * edge. `PHONE_SHOTS=<dir>` also writes the screenshots.
 */
for (const scheme of ["light", "dark"] as const) {
  test(`no strip under the dock, ${scheme}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      colorScheme: scheme,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const user = await createV3User("phone-strip");
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { theme: scheme },
      create: { userId: user.id, theme: scheme, timeZone: "Europe/Zurich" },
    });
    await signInAs(page, user);
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: "http://127.0.0.1:3000" },
      {
        name: "needt-look",
        value: `${scheme}.${scheme}.lavender`,
        url: "http://127.0.0.1:3000",
      },
    ]);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 47, bottom: 34, left: 0, right: 0 },
    });
    await page.goto("/");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    await page.waitForTimeout(1500);
    const shot = await page.screenshot();
    const dir = process.env.PHONE_SHOTS;
    if (dir) await page.screenshot({ path: `${dir}/strip-${scheme}.png` });
    const { data, info } = await sharp(shot)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // Left of the dock (x 0..64), the bottom 60 rows. The fog's halftone dots
    // may show here (they do whenever content scrolls under the fog); they are
    // pushed down by the home-indicator inset so they end close to the display
    // edge. What must never appear is plain ground between the lowest dot and
    // the edge (the visible "line"), nor a step in the last rows.
    const scale = info.height / 844;
    const rows = Math.round(60 * scale);
    const last = info.height - 1;
    const columns = Array.from({ length: 64 }, (_, i) => Math.round(i * scale));
    const ground = columns.map((x) => px(x, last));
    let lowestDotted = -1;
    for (let y = last; y > last - rows; y--) {
      const dotted = columns.some((x, i) => {
        const c = px(x, y);
        return [0, 1, 2].some((k) => Math.abs(c[k] - ground[i][k]) > 6);
      });
      if (dotted) {
        lowestDotted = y;
        break;
      }
    }
    // No dots at all (fog off, nothing scrolls under it) is fine.
    if (lowestDotted >= 0) {
      expect(last - lowestDotted).toBeLessThanOrEqual(Math.round(20 * scale));
    }
    // The very last rows are plain ground, with no step between them.
    const x = Math.round(4 * scale);
    let worst = 0;
    for (let y = info.height - 6 * scale; y < info.height - 1; y++) {
      const a = px(x, Math.round(y));
      const b = px(x, Math.round(y) + 1);
      for (let k = 0; k < 3; k++)
        worst = Math.max(worst, Math.abs(a[k] - b[k]));
    }
    expect(worst).toBeLessThanOrEqual(2);
    await context.close();
  });
}
